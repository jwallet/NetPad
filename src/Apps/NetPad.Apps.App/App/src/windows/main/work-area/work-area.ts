import {IContainer, ILogger} from "aurelia";
import {watch} from "@aurelia/runtime-html";
import {IAppService, IEventBus, IScriptService, ISession, RunOptionsDto, ScriptEnvironment} from "@domain";
import {ViewModelBase} from "@application/view-model-base";
import {ViewerHost} from "./viewers/viewer-host";
import {ViewableObject} from "./viewers/viewable-object";
import {
    IViewableAppScriptDocumentCommands,
    ViewableAppScriptDocument
} from "./viewers/text-document-viewer/viewable-text-document";
import {RunScriptEvent} from "@application";
import {Workbench} from "../workbench";

export class WorkArea extends ViewModelBase {
    constructor(
        private readonly workbench: Workbench,
        @ISession private readonly session: ISession,
        @IAppService private readonly appService: IAppService,
        @IScriptService private readonly scriptService: IScriptService,
        @IEventBus private readonly eventBus: IEventBus,
        @IContainer container: IContainer,
        @ILogger logger: ILogger,
    ) {
        super(logger);

        const viewHostFactory = container.getFactory(ViewerHost);
        this.workbench.workAreaService.viewerHosts.add(viewHostFactory.construct(container));
        //this.workAreaService.viewerHosts.push(viewHostFactory.construct(container));
    }

    public override async attaching() {
        super.attaching();

        const scriptDocuments = this.session.environments.map(env => this.createViewableAppScriptDocument(env));

        if (!this.workbench.workAreaService.viewerHosts.active) {
            await this.workbench.workAreaService.viewerHosts.activate(this.workbench.workAreaService.viewerHosts.items[0]);
        }

        this.workbench.workAreaService.viewerHosts.items[0].addViewables(...scriptDocuments);

        const activeScript = this.session.active && scriptDocuments.find(s => s.environment === this.session.active);
        if (activeScript) {
            this.workbench.workAreaService.viewerHosts.activateViewable(activeScript);
        }

        for (const viewerHost of this.workbench.workAreaService.viewerHosts.items.filter(x => !x.activeViewable && x.viewables.size > 0)) {
            const [viewable] = viewerHost.viewables;
            viewerHost.activate(viewable);
        }

        this.addDisposable(
            this.eventBus.subscribe(RunScriptEvent, async msg => {
                const scriptId = msg.scriptId ?? this.workbench.workAreaService.viewerHosts.active?.activeViewable?.id;

                if (!scriptId) return;

                const result = this.workbench.workAreaService.viewerHosts.findViewable(scriptId);
                if (result?.viewable instanceof ViewableAppScriptDocument)
                    await result.viewable.run();
            })
        );
    }

    @watch<WorkArea>(vm => vm.session.environments.length)
    private environmentsChanged() {
        const environments = this.session.environments;

        // Additions
        for (const environment of environments) {
            if (this.workbench.workAreaService.viewerHosts.items.some(vh => vh.find(environment.script.id)))
                continue;

            this.workbench.workAreaService.viewerHosts.items[0].addViewables(this.createViewableAppScriptDocument(environment));
        }

        // Removals
        for (const viewerHost of this.workbench.workAreaService.viewerHosts.items) {
            const removed: ViewableObject[] = [];

            for (const viewable of viewerHost.viewables) {
                if (!(viewable instanceof ViewableAppScriptDocument))
                    continue;

                if (!environments.some(e => e.script.id === viewable.id))
                    removed.push(viewable);
            }

            viewerHost.removeViewables(...removed);

            for (const viewable of removed) {
                viewable.dispose();
            }
        }
    }

    @watch<WorkArea>(vm => vm.session.active)
    private activeEnvironmentChanged(newActive: ScriptEnvironment | null | undefined) {
        if (!newActive) {
            return;
        }

        const result = this.workbench.workAreaService.viewerHosts.findViewable(newActive.script.id);
        if (result) {
            this.workbench.workAreaService.viewerHosts.activateViewable(result.viewable);
        }
    }

    private createViewableAppScriptDocument(environment: ScriptEnvironment): ViewableAppScriptDocument {
        // TypeScript compiler incorrectly flags this that it should be 'const'
        // eslint-disable-next-line prefer-const
        let viewable: ViewableAppScriptDocument;

        const commands: IViewableAppScriptDocumentCommands = {
            open: async (viewerHost) => {
                viewerHost.addViewables(viewable)
            },
            close: async (viewerHost) => {
                const openInOtherViewerHosts = this.workbench.workAreaService.viewerHosts.items.find(x => x !== viewerHost && x.viewables.has(viewable));

                if (openInOtherViewerHosts) {
                    viewerHost.removeViewables(viewable);
                    // TODO What tab should be activated?
                } else {
                    await this.session.close(environment.script.id);
                }
            },
            activate: async (viewerHost) => await this.session.activate(environment.script.id),
            save: async () => await this.scriptService.save(environment.script.id),
            openContainingFolder: async () => environment.script.path
                ? await this.appService.openFolderContainingScript(environment.script.path)
                : Promise.reject("Script has not been saved yet"),
            updateCode: async (newCode: string) => {
                await this.scriptService.updateCode(viewable.script.id, newCode);
            },
            run: async () => {
                const document = viewable.textDocument;
                const runOptions = new RunOptionsDto();

                if (document.selection && !document.selection.isEmpty()) {
                    runOptions.specificCodeToRun = document.textModel.getValueInRange(document.selection);
                }

                await this.scriptService.run(environment.script.id, runOptions);
            },
            stop: async () => await this.scriptService.stop(environment.script.id),
            openProperties: async () => await this.scriptService.openConfigWindow(environment.script.id, null)
        };

        viewable = new ViewableAppScriptDocument(
            environment,
            commands,
            this.eventBus
        );

        return viewable;
    }
}


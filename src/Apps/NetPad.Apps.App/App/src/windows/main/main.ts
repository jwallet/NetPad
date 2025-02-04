import {AppTask, Aurelia, IContainer, ILogger, Registration} from "aurelia";
import {IDialogService} from "@aurelia/dialog";
import {IBackgroundService} from "@common";
import {
    DataConnectionService,
    IAppService,
    IDataConnectionService,
    IScriptService,
    ScriptService,
    Settings,
} from "@domain";
import {
    BuiltinActionProvider,
    BuiltinCSharpCompletionProvider,
    BuiltinSqlCompletionProvider,
    DataConnectionName,
    DialogBackgroundService,
    IActionProvider,
    ICompletionItemProvider,
    IPaneManager,
    IShortcutManager,
    IWindowBootstrapper,
    PaneHost,
    PaneManager,
    ShortcutManager,
} from "@application";
import {Window} from "./window";
import {QuickTipsDialog} from "@application/dialogs/quick-tips-dialog/quick-tips-dialog";
import {Workbench} from "./workbench";
import {IStatusbarService, StatusbarService} from "./statusbar/statusbar-service";
import {IMainMenuService, MainMenuService} from "./titlebar/main-menu/main-menu-service";
import {IWorkAreaAppearance, WorkAreaAppearance} from "./work-area/work-area-appearance";
import {IWorkAreaService, WorkAreaService} from "./work-area/work-area-service";
import {ITextEditor, TextEditor} from "@application/editor/text-editor";
import {ITextEditorService, TextEditorService} from "@application/editor/text-editor-service";
import {AppWindows} from "@application/windows/app-windows";
import {ExcelService, IExcelService} from "@application/data/excel-service";

export class Bootstrapper implements IWindowBootstrapper {
    constructor(private readonly logger: ILogger) {
    }

    public getEntry = () => Window;

    public registerServices(app: Aurelia): void {
        app.register(
            Registration.singleton(AppWindows, AppWindows),
            Registration.singleton(IScriptService, ScriptService),
            Registration.singleton(ITextEditorService, TextEditorService),
            Registration.singleton(IDataConnectionService, DataConnectionService),
            Registration.singleton(IBackgroundService, DialogBackgroundService),
            Registration.singleton(IWorkAreaService, WorkAreaService),
            Registration.singleton(IMainMenuService, MainMenuService),
            Registration.singleton(IStatusbarService, StatusbarService),
            Registration.singleton(IWorkAreaAppearance, WorkAreaAppearance),
            Registration.singleton(Workbench, Workbench),
            Registration.transient(ITextEditor, TextEditor),
            Registration.singleton(IPaneManager, PaneManager),
            Registration.singleton(IShortcutManager, ShortcutManager),
            Registration.singleton(IActionProvider, BuiltinActionProvider),
            Registration.singleton(ICompletionItemProvider, BuiltinCSharpCompletionProvider),
            Registration.singleton(ICompletionItemProvider, BuiltinSqlCompletionProvider),
            Registration.singleton(IExcelService, ExcelService),
            PaneHost,
            DataConnectionName,
            AppTask.activated(IContainer, async container => {
                const appService = container.get(IAppService);
                await appService.notifyClientAppIsReady();
                await QuickTipsDialog.showIfFirstVisit(container.get(IDialogService));

                const settings = container.get(Settings);
                if (settings.autoCheckUpdates) {
                    appService.checkForUpdates();
                }
            })
        );

        try {
            this.registerPlugins(app.container);
        } catch (ex) {
            this.logger.error(`Error occurred while registering plugins`, ex);
        }
    }

    private registerPlugins(container: IContainer) {
        const requireContext = require.context('@plugins', true, /plugin\.ts$/);

        const pluginPaths = requireContext
            .keys()
            .filter((k: string) => {
                // For a plugin.ts file in "@plugins/plugin-dir/plugin.ts", require.context will return:
                // 1. "@plugins/plugin-dir/plugin.ts"
                // 2. "./plugin-dir/plugin.ts"
                // 3. "core/@plugins/plugin-dir/plugin.ts"
                //
                // We only want the one that starts with "@plugins"
                const startsWithPluginsRoot = k.startsWith("@plugins");

                // We don't want plugin.ts files that are not direct descendants of @plugins/plugin-dir/
                const directDescendantOfPluginDir = k
                    .replaceAll("\\", "/")
                    .split("/")
                    .length === 3;

                return startsWithPluginsRoot && directDescendantOfPluginDir;
            });

        for (const pluginPath of pluginPaths) {
            try {
                const plugin = requireContext(pluginPath);
                if (plugin.configure) {
                    plugin.configure(container);
                    this.logger.info(`Loaded plugin: ${pluginPath}`);
                }
            } catch (ex) {
                this.logger.error(`Could not load plugin: ${pluginPath}`, ex);
            }
        }
    }
}

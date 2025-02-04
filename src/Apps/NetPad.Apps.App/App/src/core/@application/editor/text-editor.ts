import {DI, ILogger} from "aurelia";
import {IHydratedController, watch} from "@aurelia/runtime-html";
import * as monaco from "monaco-editor";
import {WithDisposables} from "@common";
import {IEventBus, Settings} from "@domain";
import {ViewModelBase} from "@application";
import {TextEditorFocusedEvent} from "./events";
import {TextDocument} from "./text-document";
import {EditorSetup} from "./editor-setup";

export const ITextEditor = DI.createInterface<ITextEditor>();

export interface ITextEditor extends WithDisposables {
    monaco: monaco.editor.IStandaloneCodeEditor;
    position?: monaco.Position | null;
    active?: TextDocument | null;

    bind(host: HTMLElement): void;
    open(document: TextDocument): void;
    close(documentId: string): void;
    focus(): void;
}

export class TextEditor extends ViewModelBase implements ITextEditor {
    public monaco: monaco.editor.IStandaloneCodeEditor;
    public position?: monaco.Position | null;
    public active?: TextDocument | null;
    private element: HTMLElement;

    private viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();

    constructor(
        readonly settings: Settings,
        @IEventBus private readonly eventBus: IEventBus,
        @ILogger logger: ILogger) {
        super(logger);
    }

    binding(initiator: IHydratedController) {
        if (!initiator.host) {
            this.logger.error("Host is null or undefined");
            throw new Error("Host is null or undefined");
        }

        this.element = initiator.host;
    }

    public bind(host: HTMLElement) {
        if (this.element)
            throw new Error("Host HTMLElement is already set");

        if (!host)
            throw new Error("Host HTMLElement is null or undefined");

        this.element = host;

        this.ensureEditorInitialized();
        this.addDisposable(() => this.active = null);
    }

    public open(document: TextDocument) {
        this.ensureEditorInitialized();

        const currentOpen = this.active;
        if (currentOpen === document) {
            this.logger.warn(`Document is already open`);
            return;
        }

        if (currentOpen) {
            this.viewStates.set(currentOpen.id, this.monaco.saveViewState());
        }

        this.monaco.setModel(document.textModel);

        this.monaco.restoreViewState(this.viewStates.get(document.id) || null);

        this.active = document;
    }

    public close(documentId: string) {
        this.ensureEditorInitialized();

        this.viewStates.delete(documentId);
        if (this.active && this.active.id === documentId) {
            this.monaco.setModel(null);
            this.active = null;
        }
    }

    public focus() {
        setTimeout(() => this.monaco.focus(), 50);
    }

    private ensureEditorInitialized() {
        if (this.monaco) return;
        this.initializeEditor();
    }

    private initializeEditor() {
        if (this.monaco) return;

        this.monaco = monaco.editor.create(this.element as HTMLElement, {
            model: null,
            "semanticHighlighting.enabled": true
        });

        this.updateEditorSettings();

        this.addDisposable(this.monaco.onDidFocusEditorText(() => {
            this.eventBus.publish(new TextEditorFocusedEvent(this));
        }));

        this.addDisposable(
            this.monaco.onDidChangeCursorSelection(ev => {
                if (this.active) {
                    this.active.selection = ev.selection;
                }
            })
        );

        this.addDisposable(
            this.monaco.onDidChangeCursorPosition(ev => {
                this.position = ev.position;
            })
        );

        this.addDisposable(
            this.monaco.onDidChangeModel(ev => {
                this.position = this.monaco.getPosition();
            })
        );

        // Defer grabbing current position
        setTimeout(() => this.position = this.monaco.getPosition());

        this.focus();

        const ob = new ResizeObserver(() => this.updateEditorLayout());
        ob.observe(this.element);
        this.addDisposable(() => ob.disconnect());

        this.addDisposable(() => {
            this.viewStates.clear();
            this.monaco.dispose();
        });
    }

    private updateEditorLayout() {
        this.monaco.layout();
    }

    @watch<TextEditor>(vm => vm.settings.appearance.theme)
    @watch<TextEditor>(vm => vm.settings.editor.backgroundColor)
    @watch<TextEditor>(vm => vm.settings.editor.monacoOptions)
    private updateEditorSettings() {
        if (!this.monaco) return;

        let theme = this.settings.appearance.theme === "Light" ? "netpad-light-theme" : "netpad-dark-theme";

        if (this.settings.editor.backgroundColor) {
            const base: monaco.editor.BuiltinTheme = this.settings.appearance.theme === "Light" ? "vs" : "vs-dark";

            EditorSetup.defineTheme("custom-theme", {
                base: base,
                inherit: true,
                rules: [],
                colors: {
                    "editor.background": this.settings.editor.backgroundColor,
                },
            });
            theme = "custom-theme";
        }

        const options = {
            theme: theme
        };

        Object.assign(options, this.settings.editor.monacoOptions || {})
        this.monaco.updateOptions(options);
    }
}

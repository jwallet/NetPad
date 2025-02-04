import {IContainer} from "aurelia";
import * as monaco from "monaco-editor";
import {EditorUtil, IActionProvider} from "@application";
import {IScriptService, ISession, Script, ScriptKind} from "@domain";

export class BuiltinActionProvider implements IActionProvider {
    constructor(@IContainer private readonly container: IContainer) {
    }

    public provideActions(): monaco.editor.IActionDescriptor[] {
        return [
            {
                id: "builtin.actions.transformToUpperOrLowercase",
                label: "Transform to Upper/Lower Case",
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyY],
                run: (editor) => {
                    const model = editor?.getModel();
                    const currentSelection = editor?.getSelection();

                    if (!editor || !model || !currentSelection) return;

                    const selectedValue = model.getValueInRange(currentSelection);

                    if (!selectedValue.trim()) return;

                    if (selectedValue === selectedValue.toLowerCase()) {
                        editor.trigger(null, "editor.action.transformToUppercase", null);
                    } else {
                        editor.trigger(null, "editor.action.transformToLowercase", null);
                    }
                }
            },
            {
                id: "builtin.actions.goToScript",
                label: "Go to Script",
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT],
                run: async () => {
                    const quickInput = EditorUtil.getQuickInputService();
                    const scope = this.container.createChild({inheritParentResources: true});

                    try {
                        const session = scope.get(ISession);
                        const opened = [...session.environments];

                        const open = (script: Script) => {
                            if (script.path) session.openByPath(script.path);
                            else session.activate(script.id);
                        };

                        const picks: Partial<{
                            type: string,
                            id: string,
                            label: string,
                            meta: string,
                            description: string,
                            detail: string
                        }>[] =
                            opened
                                .map(env => this.toPick(env.script))
                                .sort((a) => a.id === session.active?.script.id ? -1 : 1);

                        quickInput.pick(picks, {placeholder: "Go to script"}).then((selected) => {
                            if (!selected) {
                                // Cancelled
                                return;
                            }

                            open(selected.script);
                        });

                        const service = scope.get(IScriptService);
                        const scripts = await service.getScripts();

                        if (scripts.length) {
                            picks.push({
                                type: "separator"
                            });

                            picks.push(...scripts
                                .filter(s => picks.every(p => p.id !== s.id))
                                .map(script => this.toPick(script))
                                .sort((a, b) => a.label > b.label ? 1 : -1)
                            );

                            quickInput.pick(picks, {placeholder: "Go to script"}).then((selected) => {
                                if (!selected) {
                                    // Cancelled
                                    return;
                                }

                                open(selected.script);
                            });
                        }
                    } finally {
                        scope.dispose();
                    }
                }
            }
        ];
    }

    private toPick(script: Partial<{
        id: string,
        name: string,
        path: string,
        isDirty: boolean,
        kind: ScriptKind
    }>) {
        const icon = script.kind === "SQL"
            ? "$(sql)"
            : "$(csharp)";

        return {
            type: 'item',
            id: script.id,
            label: `${icon} ${script.name}`,
            description: !script.path ? "(New)" : ((script.isDirty ? "(Modified) " : "") + script.path),
            // detail: "test detail",
            // meta: "test meta",
            script: script
        }
    }
}

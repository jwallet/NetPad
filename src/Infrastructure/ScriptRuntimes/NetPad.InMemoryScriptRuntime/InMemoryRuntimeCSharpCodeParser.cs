using NetPad.Compilation;
using NetPad.DotNet;
using NetPad.IO;
using NetPad.Scripts;

namespace NetPad.Runtimes;

public class InMemoryRuntimeCSharpCodeParser : ICodeParser
{
    public const string BootstrapperClassName = "ScriptRuntimeServices";
    public const string BootstrapperSetIOMethodName = "SetIO";

    private static readonly string[] _usingsNeededByBaseProgram =
    {
        "System",
        "NetPad.IO"
    };

    public CodeParsingResult Parse(
        string code,
        ScriptKind scriptKind,
        IEnumerable<string>? namespaces = null,
        CodeParsingOptions? options = null)
    {
        var userProgram = GetUserProgram(code, scriptKind);

        var bootstrapperProgramTemplate = GetBootstrapperProgramTemplate();
        var bootstrapperProgram = string.Format(
            bootstrapperProgramTemplate,
            BootstrapperClassName,
            BootstrapperSetIOMethodName);

        var bootstrapperProgramSourceCode = new SourceCode(bootstrapperProgram, _usingsNeededByBaseProgram);

        return new CodeParsingResult(
            new SourceCode(userProgram, namespaces),
            bootstrapperProgramSourceCode,
            options?.AdditionalCode,
            new ParsedCodeInformation(BootstrapperClassName, BootstrapperSetIOMethodName));
    }

    public string GetUserProgram(string scriptCode, ScriptKind kind)
    {
        string userCode;

        if (kind == ScriptKind.Expression)
        {
            throw new NotImplementedException("Expression code parsing is not implemented yet.");
        }

        if (kind == ScriptKind.SQL)
        {
            scriptCode = scriptCode.Replace("\"", "\"\"");

            userCode = $@"
await using var command = DataContext.Database.GetDbConnection().CreateCommand();

command.CommandText = @""{scriptCode}"";
await DataContext.Database.OpenConnectionAsync();

try
{{
    await using var reader = await command.ExecuteReaderAsync();

    do
    {{
        var dataTable = new System.Data.DataTable();
        dataTable.Load(reader);

        if (dataTable.Rows.Count > 0)
            dataTable.Dump();
        else
            ""No rows returned"".Dump();
    }} while (!reader.IsClosed);

    return 0;
}}
catch (System.Exception ex)
{{
    ex.Message.Dump();
    return 1;
}}
";
        }
        else
        {
            userCode = scriptCode;
        }

        return userCode;
    }

    public string GetBootstrapperProgramTemplate()
    {
        return $@"class {{0}}
{{{{
    internal static IScriptOutputAdapter<ScriptOutput, ScriptOutput> Output {{{{ get; set; }}}}

    private static void {{1}}(IScriptOutputAdapter<ScriptOutput, ScriptOutput> output)
    {{{{
        Output = output;
    }}}}

    internal static void OutputWrite(object? o = null, string? title = null)
    {{{{
        Output.{nameof(IScriptOutputAdapter<ScriptOutput, ScriptOutput>.ResultsChannel)}.WriteAsync(new RawScriptOutput(o), title);
    }}}}

    internal static void OutputWriteLine(object? o = null, string? title = null)
    {{{{
        Output.{nameof(IScriptOutputAdapter<ScriptOutput, ScriptOutput>.ResultsChannel)}.WriteAsync(new RawScriptOutput(o), title);
    }}}}

    internal static void SqlWrite<T>(T? o, string? title = null)
    {{{{
        {{0}}.Output.{nameof(IScriptOutputAdapter<ScriptOutput, ScriptOutput>.SqlChannel)}?.WriteAsync(new RawScriptOutput(o), title);
    }}}}
}}}}

static class Exts
{{{{
    /// <summary>
    /// Dumps this object to the results view.
    /// </summary>
    /// <param name=""o"">The object being dumped.</param>
    /// <param name=""title"">An optional title for the result.</param>
    /// <returns>The object being dumped.</returns>
    [return: System.Diagnostics.CodeAnalysis.NotNullIfNotNull(""o"")]
    public static T? Dump<T>(this T? o, string? title = null)
    {{{{
        {{0}}.OutputWriteLine(o, title);
        return o;
    }}}}
}}}}
";
    }
}

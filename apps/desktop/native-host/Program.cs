using System.Buffers.Binary;
using System.Net.Http.Json;
using System.Text.Json;

// Chrome/Edge Native Messaging: four-byte little-endian length, then one UTF-8 JSON message.
// The extension can ping, explicitly share one tab, or send one user-authored task.
static async Task<JsonDocument> ReadMessageAsync(Stream input)
{
    var header = new byte[4];
    await input.ReadExactlyAsync(header);
    var length = BinaryPrimitives.ReadInt32LittleEndian(header);
    if (length is < 1 or > 1_048_576) throw new InvalidDataException("Invalid message length.");
    var payload = new byte[length];
    await input.ReadExactlyAsync(payload);
    return JsonDocument.Parse(payload);
}
static async Task WriteMessageAsync(Stream output, object value)
{
    var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
    var header = new byte[4];
    BinaryPrimitives.WriteInt32LittleEndian(header, bytes.Length);
    await output.WriteAsync(header);
    await output.WriteAsync(bytes);
    await output.FlushAsync();
}

try
{
    using var request = await ReadMessageAsync(Console.OpenStandardInput());
    var root = request.RootElement;
    if (!root.TryGetProperty("type", out var type))
    {
        await WriteMessageAsync(Console.OpenStandardOutput(), new { ok = false, error = "Unsupported message." });
        return;
    }
    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(125) };
    if (type.GetString() == "browser-ping")
    {
        client.Timeout = TimeSpan.FromSeconds(4);
        using var response = await client.GetAsync("http://127.0.0.1:4178/api/health");
        await WriteMessageAsync(Console.OpenStandardOutput(), new { ok = response.IsSuccessStatusCode, message = response.IsSuccessStatusCode ? "Desktop app connected." : "Open the Robot Orchestra desktop app." });
        return;
    }
    if (type.GetString() == "browser-context")
    {
        var context = root.TryGetProperty("context", out var c) ? c : default;
        using var response = await client.PostAsJsonAsync("http://127.0.0.1:4178/api/browser/context", new
        {
            url = context.ValueKind == JsonValueKind.Object && context.TryGetProperty("url", out var url) ? url.GetString() : null,
            title = context.ValueKind == JsonValueKind.Object && context.TryGetProperty("title", out var title) ? title.GetString() : "",
            selectedText = context.ValueKind == JsonValueKind.Object && context.TryGetProperty("selectedText", out var selected) ? selected.GetString() : ""
        });
        var ok = response.IsSuccessStatusCode;
        await WriteMessageAsync(Console.OpenStandardOutput(), new { ok, error = ok ? null : "Desktop app did not accept tab context. Is it running?" });
        return;
    }
    if (type.GetString() == "copilot-task")
    {
        var context = root.TryGetProperty("context", out var c) ? c : default;
        var payload = new
        {
            task = root.TryGetProperty("task", out var task) ? task.GetString() : "",
            browserContext = context.ValueKind == JsonValueKind.Object ? new
            {
                url = context.TryGetProperty("url", out var url) ? url.GetString() : null,
                title = context.TryGetProperty("title", out var title) ? title.GetString() : "",
                selectedText = context.TryGetProperty("selectedText", out var selected) ? selected.GetString() : ""
            } : null
        };
        using var response = await client.PostAsJsonAsync("http://127.0.0.1:4178/api/browser/submit", payload);
        var body = await response.Content.ReadAsStringAsync();
        string? message = null;
        try
        {
            using var result = JsonDocument.Parse(body);
            var data = result.RootElement;
            if (data.TryGetProperty("message", out var m)) message = m.GetString();
            else if (data.TryGetProperty("result", out var r) && r.ValueKind == JsonValueKind.String) message = r.GetString();
            else if (data.TryGetProperty("error", out var e)) message = e.GetString();
        }
        catch { }
        await WriteMessageAsync(Console.OpenStandardOutput(), new { ok = response.IsSuccessStatusCode, message, error = response.IsSuccessStatusCode ? null : message ?? "The Hermes adapter did not accept the task." });
        return;
    }
    await WriteMessageAsync(Console.OpenStandardOutput(), new { ok = false, error = "Unsupported message." });
}
catch
{
    // Native messaging stdout is protocol-only. Keep diagnostics off stdout.
    await WriteMessageAsync(Console.OpenStandardOutput(), new { ok = false, error = "Could not reach the Robot Orchestra desktop app. Open it and try again." });
}

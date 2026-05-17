# Glassbox Plugin Directory

This directory contains compiled plugin shared libraries (.so files) that extend Glassbox's decoding capabilities.

## Plugin Discovery

Glassbox automatically loads all `.so` files from this directory at runtime. Each plugin must implement the `DecoderPlugin` interface and export a `NewPluginFactory` function.

## Plugin Development

See `examples/plugins/` for a working example of a custom decoder plugin.

### Requirements

- Implement the `plugin.DecoderPlugin` interface
- Export a `NewPluginFactory() (plugin.DecoderPlugin, error)` function
- Build with `-buildmode=plugin` flag
- Use matching API version (`plugin.Version`)

### Building

```bash
cd examples/plugins/custom-decoder
make build
```

This compiles the plugin to the `plugins/` directory.

## Plugin API

Plugins must implement:

- `Name() string` - Plugin identifier
- `Version() string` - Semantic version
- `CanDecode(eventType string) bool` - Event type matching
- `Decode(data []byte) (json.RawMessage, error)` - Decoding logic
- `Metadata() PluginMetadata` - Plugin information

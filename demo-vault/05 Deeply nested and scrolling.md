---
deep:
  a:
    b:
      c:
        d:
          e:
            f: a-very-long-value-that-forces-the-properties-panel-to-scroll-horizontally
config:
  service:
    database:
      connection:
        pool:
          maxConnections: 20
          timeoutMs: 30000
---
[Docs](https://github.com/mnaoumov/obsidian-nested-properties#features)

# Deeply nested and scrolling

Deeply nested structures can grow wider than the Properties panel. Nested Properties keeps them on one line and adds a **floating horizontal scrollbar** so you can scroll sideways without losing your place.

## Look at the Properties panel

1. Expand `deep` all the way down to `f` - the value is intentionally long.
2. A floating scrollbar appears at the bottom of the Properties container; drag it, use the mouse wheel, or press the left and right arrow keys to scroll horizontally.
3. `config.service.database.connection.pool` nests real-looking settings five levels down.

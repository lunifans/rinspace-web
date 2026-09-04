# Product route-family styles

These six minimized, route-split files contain the selectors still owned by each production page
family after removal of the historical global stylesheet. They load inside the low-priority
`route-foundation` cascade layer and only with the matching lazy route module. The unlayered token,
foundation and Animate UI component styles therefore own the visual result.

Do not add global page rules here. New interactions belong in the owned Animate UI layer; new
product compositions belong in typed feature/components modules. Rich-content, editor and frozen
integration exceptions must remain explicitly scoped and tested.

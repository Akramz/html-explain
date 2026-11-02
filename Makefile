.PHONY: check example

check: ## syntax, the example spec, and the build tests
	node --check plugin/skills/html-explain/runtime/explain.js
	node plugin/skills/html-explain/runtime/build.mjs plugin/skills/html-explain/examples/html-explain.json --check
	node --test tests/*.test.mjs

example: ## build the example page into docs/example.html
	node plugin/skills/html-explain/runtime/build.mjs plugin/skills/html-explain/examples/html-explain.json -o docs/example.html

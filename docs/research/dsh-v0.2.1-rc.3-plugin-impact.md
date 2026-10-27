# DSH v0.2.1-rc.3: release changes and plugin impact

**Research date:** 2026-10-26  
**Scope:** Official DeepSeek Harness source/release material only; assess likely plugin compatibility effects. This is a source-diff assessment, not a runtime qualification.

## Executive assessment

The rc.2 → rc.3 change is principally a significant client-UI/plugin extension update, not a general plugin-runtime rewrite. It introduces customizable navigation entries (pin/unpin and More menus) across sidebar, conversation-view tabs, and right-sidebar guide; introduces structured draft conflict behavior for plugin-provided draft prompts; and restores New Session reuse of a matching workspace blank. Plugins that register navigation launchers, use affected slots, manipulate draft initialization, or depend on blank/session creation assumptions deserve targeted rc.3 testing. The comparison reports 219 files changed, including new client extension packages/docs and relevant tests; that size is not itself evidence of a breaking change.

## Release changes established by official sources

1. **Navigation entry customization is added.** The rc.2..rc.3 compare patch's feature commit describes region-owned pinned/unpinned lists, per-region More buttons/menus, and a new `ui-entry-customization` plugin that contributes menu rows to action slots. The implementation removes `ctx.layout.entryVisibility`, a plugin store, sidebar drag reordering, and `agentPresetNavigation`; the release patch says `ui-layout` and `ui-agent-preset` match the 0.2.1 release line. See the [official rc.2-to-rc.3 patch](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3.patch), and the tagged [entry customization package README](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/client/ui-entry-customization/README.md), [sidebar slot contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/client/ui-sidebar/src/client/contract/slots.ts), and [conversation slot contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/client/ui-conversation/src/client/contract/slots.ts).
2. **Draft initialization gains an explicit conflict policy.** `DraftInitializationOptions` adds `whenDraftExists: 'replace' | 'append' | 'keep'`, defaulting to `keep`; legacy `clearPreviousDraft` maps to `replace` only when `whenDraftExists` is omitted. Append places prompt paragraphs after existing text/references and attachments persist in all modes. The behavior is captured in the [rc.2-to-rc.3 source patch](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3.patch) and tagged [conversation input contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/client/ui-conversation/src/client/contract/input.ts).
3. **New Session reuses a matching workspace blank.** The release patch documents return to the existing blank and unsent draft rather than unconditionally creating a fresh Session. A request naming an Agent preset excludes blanks with another preset. See the [official patch](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3.patch), tagged [session service](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.3/packages/client/ui-conversation/src/client/sessions/service.ts), and the new-session changes in the patch.
4. **Other client UI work** includes tooltip placement/overlap fixes, a reusable More glyph, and UI/readme/catalog/test updates. These are visible in the same official compare patch. No claim is made here that those fixes alter plugin APIs.

The release itself is published as [DSH v0.2.1-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3); the [tagged source tree](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.1-rc.3) anchors source paths above.

## Plugin-facing risks and compatibility assessment

| Area | Likely impact | Who should test | Certainty |
|---|---|---|---|
| `ctx.layout.entryVisibility` and related custom visibility/reordering state | The release patch explicitly says this surface/store and sidebar drag reordering are removed in favor of region-owned pin state and More menus. Plugins using that removed/internal surface may break or lose behavior; migrate to the documented rc.3 slots/API where applicable. | Plugins customizing panel/view visibility or order; review references to `entryVisibility` and old navigation hooks. | **High** that removal is in the source patch; **conditional** impact depends on plugin usage. |
| Launchers in left sidebar, conversation views, and right guide | Entries may now be hidden under region-specific More menus when unpinned. The selected entry remains visible while unpinned until another is selected. User-visible placement/visibility assumptions and tests asserting fixed row sets/order can fail even if registration still works. | Plugins adding navigation entries, especially selectors relying on permanent visibility or ordering. | **High** for UI behavior in patch; exact downstream impact is plugin-specific. |
| Draft prompt/pre-fill actions | Existing consumers setting `clearPreviousDraft` remain supported per patch, but when callers combine it with the new `whenDraftExists`, the latter takes precedence. Default behavior for non-empty drafts is keep; plugin flows expecting their prompt to overwrite or append must explicitly choose. | Plugin-created draft prompts, “create/start” actions, or code calling `startSession`/draft initialization. | **High** for described API semantics; validate installed host behavior before release. |
| New Session / Session identity assumptions | A repeated New Session request can return/reuse a blank rather than create a new id. Plugins that assume each click means a new Session, or cache per-new-session setup using creation-only hooks, should check idempotency and blank reuse. Preset-specific blanks are filtered as described. | Plugins observing session creation, initial drafts, preset changes, workspace membership, or counting Sessions. | **High** that reuse behavior is intentional; **medium** for downstream breakage absent plugin code review. |
| Host/package version alignment | This is an RC with client packages and slot/catalog changes. Build/install against the exact Desktop host release and its package set; test actual plugin loading, not only type mocks. The compared patch does not establish a universal compatibility guarantee for third-party plugin bundles. | All plugin maintainers, especially those importing internal client packages or depending on exact package versions. | **High** recommendation; absence of compatibility guarantee is a boundary, not an asserted breaking change. |

## Suggested compatibility checks

- Search plugin code for `entryVisibility`, sidebar drag reorder assumptions, navigation visibility/order assertions, and direct/internal slot usage.
- Exercise pin/unpin and selection in each affected region, including reload persistence and finding unpinned entries in More.
- Test empty and populated drafts (including references/attachments) for default `keep`, explicit `replace`, explicit `append`, and legacy `clearPreviousDraft` behavior.
- Test New Session with an existing blank and an existing blank for a different Agent preset; assert the correct retained session/draft and avoid assuming a new ID.
- Build and smoke-test with the target DSH Desktop rc.3 installation. Source tests and Web e2e coverage in the release patch are evidence of intended behaviors, not proof that a particular third-party plugin works in Desktop.

## Certainty boundaries

- Strongest evidence is the first-party GitHub release, the official tag-to-tag patch, and tagged source/docs linked above.
- The upstream release change list includes implementation details in commit messages and file diffs; this report separates direct source facts from conditional plugin-impact inference.
- The repository inspected for this note is a plugin collection. No individual plugin compatibility claim is made without auditing/building that plugin against an rc.3 Desktop runtime.
- No secondary articles or community posts were used as evidence.

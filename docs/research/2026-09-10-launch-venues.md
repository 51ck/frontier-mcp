# Launch venue inventory

Date: 2026-09-10. Answers [T41](../../.scratch/frontier-launch/issues/01-T41-where-the-people-who-already-run-this-workflow-g.md).

This is an inventory, not a channel selection or launch sequence. It covers unpaid discovery for
FrontierMCP, especially people already using agent-driven Ticket workflows. No submission, post,
account registration, or contact was made. Paid distribution remains outside this Effort.

## Evidence and limits

Sources are the venues' own documentation, rules, and public pages, opened September 10–11.
Some web responses were cached days or weeks earlier, especially Reddit; these are the rules and
feeds returned at inspection, not a guarantee of live state. Counts are snapshots, not forecasts. Repository stars, directory entries, and post counts do not
measure qualified users. No venue supplied a conversion rate for an unknown local tracker. In every
row, **possible result** is an inference about the route's mechanism, not a promise or measured
acquisition estimate; zero users remains plausible everywhere.

An unknown count means the public source did not expose a reliable number in this read. A blocked
page is an evidence gap, not evidence that its community is inactive. Re-check rules before any
later posting. Human-written posts matter independently of whether the tool being described uses AI.

## Directories, registries, and plugin distribution

| Venue and audience | Size and activity observed | Entry cost and requirements | Curation and self-promotion | Possible result for FrontierMCP (inference) |
| --- | --- | --- | --- | --- |
| Official MCP Registry: machine-readable discovery for clients and downstream directories | Public registry and publishing docs available; total entries and human traffic not established. The quickstart still labels it preview. | Publish package metadata containing matching `mcpName`; prepare `server.json`, authenticate the namespace, publish via `mcp-publisher`. Existing npm release needs this metadata before registration. No listing fee documented. | Namespace/package validation; abuse reports go to package registry and registry maintainers. Author publication is the intended route, not an editorial endorsement. | Discoverable metadata and possible downstream inclusion; does not itself create a conversation with workflow users. [Publishing](https://modelcontextprotocol.io/registry/quickstart), [FAQ](https://modelcontextprotocol.io/registry/faq), [registry](https://registry.modelcontextprotocol.io/). |
| `punkpeye/awesome-mcp-servers`: installable open-source server list | 2,297 open / 10,675 closed PRs; multiple submissions dated Sep 10. Closed count is not merged count; backlog does not establish review time. | Public GitHub repo; PR adding one concise linked entry under the correct alphabetical category. GitHub account and maintenance time; no fee documented. | Maintainer review; additions explicitly encouraged, including an automated-PR opt-in. Preserve formatting and accurate descriptions. | A categorized link if accepted; many competing submissions and no assured readers. [Contribution rules](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md), [queue](https://github.com/punkpeye/awesome-mcp-servers/pulls). |
| Glama open-source registry: searchable servers/tools with installation information | 85,220 servers; page reports updated Sep 10 at 19:37. This is catalog size, not audience size. | Submit GitHub URL, display name and description; optional `glama.json` metadata. No fee stated for this submission route; paid extras were not assessed. | Automated license, security and health checks. Operator says most pass within minutes; that is its claim, not measured here. Direct author submissions welcome. | Search/category visibility and installation details; unmeasured chance of qualified trials. A remote hosted connector is a separate product route, not necessary for a local listing. [FAQ](https://glama.ai/mcp/faq), [catalog](https://glama.ai/mcp/servers). |
| Smithery: MCP distribution and connection platform | Homepage advertises 20,026+ MCPs and displays per-server uses; neither is a unique-user count. | Current docs support local stdio through a prebuilt `.mcpb` bundle, plus a separate public-HTTPS Streamable HTTP route. FrontierMCP would need bundle packaging for the documented local path. Submission pricing not established from publishing docs. | Publishing/scanning and official-vendor verification documented; author publication is supported. Acceptance timing and editorial promotion unknown. | A local install artifact and catalog page after additional packaging; do not redesign the tracker into a hosted service merely to list it. [Publish](https://smithery.ai/docs/build/publish), [catalog](https://smithery.ai/). |
| Official Claude plugin directory: Cowork and Claude Code discovery | Automatically available as `claude-plugins-official`; qualified audience size and current submission volume unknown. | Public GitHub plugin, `claude plugin validate`, then signed-in submission. Claude.ai requires Team/Enterprise directory access; an individual can use Console with Developer/Admin/Owner permissions. Local MCPs are allowed. No submission fee stated. | Basic automated screening; additional Anthropic Verified review is separate and not guaranteed. Updates are screened too; queue time varies. | Direct in-client discoverability if accepted, after creating a useful plugin package. A directory entry does not establish skill-workflow adoption. [Submission rules](https://claude.com/docs/plugins/submit). |
| Self-hosted Claude plugin marketplace: opt-in distribution to existing users | No inherited audience; size starts with users who add it. | Host a plugin catalog and plugin in a git repository; users add the marketplace then install. Costs are packaging, documentation and ongoing version maintenance. | Author controls catalog; users choose to trust it. Reserved official names cannot be used. | Easier repeatable installation for people reached elsewhere; not a discovery audience by itself. [Marketplace documentation](https://code.claude.com/docs/en/plugin-marketplaces). |

The official Registry and Glama are related discovery routes, so listing counts must not be added
as if they represented distinct audiences. The Registry documents downstream aggregators explicitly.
[Registry aggregators](https://modelcontextprotocol.io/registry/registry-aggregators).

## Launch aggregators and publishing communities

| Venue and audience | Size and activity observed | Entry cost and requirements | Moderation and self-promotion | Possible result (inference) |
| --- | --- | --- | --- | --- |
| Hacker News / Show HN: broad technical readers, including agent-tool builders | `shownew` showed 30 entries spanning hours, with several at 1–3 points and no comments. This is an early-life snapshot, not lifetime performance or a representative conversion sample. Total audience unknown. | Account, personally built nontrivial runnable project, `Show HN` title, low-friction trial, and maker available for discussion. No fee stated. | Every valid Show enters `shownew`; a small points threshold gates `show`. Occasional own work allowed, primary promotion use and vote solicitation prohibited. Generated or AI-edited text is prohibited. | Zero discussion is realistic; a few technical objections or trials would be useful. A bare landing page is ineligible. Human must write and own the conversation. [Show rules](https://news.ycombinator.com/showhn.html), [general rules](https://news.ycombinator.com/newsguidelines.html), [activity](https://news.ycombinator.com/shownew). |
| Lobsters: computing-focused link discussion | Multiple Sep 10 stories and comments. Stats defines monthly active users, but chart values were unavailable in the text extraction; no numeric audience claimed. | Invitation; first 70 days restrict `show`, `announce`, `vibecoding` and other tags and unseen domains. Relevant technical link and tags; no listing fee documented. | Authors welcome; self-promotion should remain below a quarter of stories/comments. Personal productivity systems are off-topic. Spam includes content without meaningful human authorship. | Technical storage/concurrency analysis may attract discussion; a productivity pitch is a poor fit. Not a dependable immediate self-launch route for a new account. [Rules](https://lobste.rs/about), [activity](https://lobste.rs/newest), [stats](https://lobste.rs/stats). |
| DEV / `#mcp`: developer writing and tutorials | Tag page had 468 pagination pages and multiple Sep 10 posts, including agent-workflow topics. Pagination is not a verified post count; active readership unknown. | Account and substantial on-platform article with useful content. An external link alone is insufficient. No required publishing fee found in cited policy. | Content must be on-topic, high-quality and not primarily promotional/backlink creation; DEV can remove it or restrict participation. | A durable, searchable tutorial and occasional feedback; a product announcement copied into an article is insufficient. [Content policy](https://dev.to/terms), [tag activity](https://dev.to/t/mcp). |
| Product Hunt: broad maker/early-adopter launch directory | Homepage exposed 20 top products for the day and active forum threads. Leaderboard visibility is a selected sample; total audience and unfeatured-project outcomes unknown. | Free submission through personal account, product URL and launch materials. Maker can self-submit; no third-party hunter needed. Budget time for discussion and presentation. | Self-launch explicitly encouraged; company accounts and direct requests for upvotes prohibited. The guide does not promise homepage placement or disclose a complete review SLA. | A product page and possible broad feedback; many readers will not already use `.scratch/` workflows. Votes do not establish retention. [Guide](https://www.producthunt.com/launch), [activity](https://www.producthunt.com/). |

## Skills users and agent-tooling communities

| Venue and audience | Size and activity observed | Entry cost and requirements | Moderation and self-promotion | Possible result (inference) |
| --- | --- | --- | --- | --- |
| Matt Pocock skills Discussions / Show and tell: users of the actual upstream workflow | Sep 4 local-Markdown mission-control panel and Jul 16 Wayfinder Obsidian plugin each showed zero replies; Aug 15 interactive grilling showed one. Overall active-user count unknown. | GitHub account and an explanation of something made. Category explicitly invites showing work; no posting fee or numerical participation gate found. | Maintainer/community space with GitHub community guidelines; no bespoke external-tool promotion policy found. Showcase invitation supports a relevant demonstration, not arbitrary advertising. | Closely matched readers, but comparable projects show that no replies is realistic. [Show and tell](https://github.com/mattpocock/skills/discussions/categories/show-and-tell), [maintainer welcome](https://github.com/mattpocock/skills/discussions/214). |
| r/ClaudeAI: general Claude users, including coding workflows | Public feed included showcases and continuous-coding questions. Reliable membership and posting-rate counts unavailable. | Feed post requires OP karma greater than 100. Describe project, Claude's role and function; free to try and explicitly stated; correct flair. | Minimal promotion; no referral links or recruiting. Moderated subreddit. | A Claude-specific demonstration may produce feedback; karma and genuine Claude involvement are concrete entry gates. [Rules and feed](https://www.reddit.com/r/ClaudeAI/). |
| r/ClaudeCode: coding-agent users | Feed included CLAUDE.md audits and long-running backlog workflows; reliable member count and rate unavailable. | Simple sharing in weekly showcase; standalone Built with Claude Code post must explain product, Claude Code use and lessons. No numeric account gate found. | Correct flair; no repeated promotion, disguised advertisements or referral/affiliate links. | A detailed first-hand workflow account can start a focused conversation; a short announcement belongs in the shared thread. [Rules and feed](https://www.reddit.com/r/ClaudeCode/). |
| r/cursor: Cursor users | Workflow and subagent troubleshooting visible; reliable member count and posting rate unavailable. | Relevant valuable promotion at most 10% of activity across Reddit; contextual text post and flair. No owned paid content or surveys. | No duplicate/excessive posting or AI text without substantial human input. | Free OSS walkthrough is conditional on participation history; a fresh promotion-only account fails the ratio. [Rules and feed](https://www.reddit.com/r/cursor/). |
| r/mcp: MCP builders and users | Local-server showcases, collaboration tools and retrospectives visible; reliable member count and rate unavailable. | Fully launched project, disclosed authorship and showcase flair; no waitlists. No numerical account threshold found. | Self-promotion explicitly allowed when disclosed; astroturfing and AI promotional slop can lead to bans. | A working local MCP server fits the stated showcase route, with no assured response. [Rules and feed](https://www.reddit.com/r/mcp/). |
| Cursor official forum / Showcase: Built for Cursor includes MCP servers | Sep 2–10 examples included context-cost and multi-session tools with 14–75 views and 0–3 replies. Small early sample, not a traffic estimate. | Forum account; contribute before self-promotion, provide relevant helpful explanation, disclose financial interest. No numeric account gate found. | Moderated; entirely AI-generated posts likely removed. | Searchable feedback from directly relevant users, plausibly modest initial response. [Showcase](https://forum.cursor.com/c/showcase/9), [guidelines](https://forum.cursor.com/t/cursor-community-forum-guidelines/4). |
| Cursor Discord: real-time user community linked by Cursor | Official community page confirms route. Invite is JavaScript-only in this read; membership, message rate and recent activity unverified. | Discord invite/onboarding; exact channel permissions and promotion requirements unavailable outside server. | Rules and moderation policy unverified; forum rules cannot be assumed to apply. | A lead for later inspection, not an approved posting venue. [Official community page](https://cursor.com/community), [invite](https://discord.com/invite/cursor). |
| Community-run Model Context Protocol Discord | Discovery page reported 13,964 members / 1,766 online; advertises author discussions, server feed and project showcases. Online count is not active conversation or qualified users. | Public join route; server-author flair available. In-server channel rules and promotion cadence not inspected. | Showcase intent public; exact moderation rules unknown. Distinct from official contributor Discord. | Possible author/user conversations after checking channel rules; cannot estimate conversion from membership. [Discovery page](https://discord.com/servers/model-context-protocol-1312302100125843476). |
| Official MCP contributor Discord | SDK/protocol contributors and working groups; membership/activity numbers not exposed in communication docs. | Contributor channels for protocol collaboration; code of conduct applies. No promotion route. | Explicitly discourages user support and prohibits service/product marketing; vendor-neutral technical discussions. | Dead end for launch promotion. A real protocol contribution belongs here independently of launch. [Communication rules](https://modelcontextprotocol.io/community/communication). |

All community routes above were inspected without joining or paying. Where no fee is specified, that
means no fee was found in the cited public route, not that every optional membership or product is free.
Reddit's logged-out `/about/rules/` pages returned empty moderator tables; the rules recorded above
came from the public subreddit homepage sidebars. Unlabeled header counts were deliberately not
reported as members or online users.

### Upstream skill contributions versus external references

The skills repository has an actual discussion venue for related work. Its maintainer welcome invites
questions, ideas and introductions; the examined welcome had 25 comments and 5 replies. These are
thread counts, not audience reach. [Welcome](https://github.com/mattpocock/skills/discussions/214).

The upstream `CLAUDE.md` describes skill additions and corresponding README/plugin/router maintenance.
Its README references concern promoted skills and their `SKILL.md` files. This documents a contribution
workflow, but does not establish an external-tool directory or permission to add a FrontierMCP advert
to the README. No specific external-integration reference submission process was found; the attempted
`CONTRIBUTING.md` fetch failed, so no absence-of-policy conclusion follows. A showcase demonstration
has a verified home; a promotional upstream PR has no verified acceptance path.
[Upstream contributor instructions](https://raw.githubusercontent.com/mattpocock/skills/main/CLAUDE.md).

## Dead ends and unresolved entry gates

- **Official reference-server repository as a listing:** its README directs server discovery to the
  Registry and reserves the repository for reference implementations. Do not assume the old
  community-list PR route still exists. It is active software, not an inactive directory.
  [Repository scope](https://github.com/modelcontextprotocol/servers).
- **Official contributor Discord as a launch channel:** product marketing is out of scope. The
  community-run showcase Discord is a different venue with different rules.
- **Fresh Lobsters account for an immediate show/announce:** invitation plus 70-day new-user
  restrictions make this unreliable. Productivity-system framing is also explicitly off-topic.
- **Automated launch prose on HN:** generated and AI-edited text is prohibited. This inventory can
  inform a human's decision; it is not post copy to paste there. Cursor forum and subreddit also
  require meaningful human contribution, under their own rules.
- **Bare promotional backlink on DEV:** its content policy requires substantial useful content on
  the platform. A link drop is not a qualifying article.
- **Smithery public-URL route for the current local server:** it requires a hosted HTTP endpoint.
  The documented MCPB route avoids that mismatch but adds packaging work; no bundle was built here.
- **Cursor Discord rules and upstream external-reference policy:** incomplete public evidence.
  Neither should be treated as permission, and neither is established as inactive or hostile.

No examined venue was proven inactive. The useful negative results are explicit policy mismatches,
account gates, packaging requirements and inaccessible rules, rather than invented inactivity claims.

## Handoff and verification

This inventory does not choose venues or promise retained users. Later planning must account for
human participation history, eligible accounts, plugin/bundle packaging, a working first-run example,
and availability to answer replies. The Effort's one-user-after-30-days win condition cannot be
inferred from votes, stars, directory presence or download counts.

Primary pages were opened and policy claims checked against the source that owns them. Source
collection began September 10; the draft and selected community-source checks finished September 11.
Snapshot counts above retain their September 10 observation date. No existing research snapshot was
revised. Root DOX already owns dated research and requires a Ticket pointer, so its structure and
contracts need no change for this artifact. Markdown-only verification: local link checks and
`git diff --check`; the unrelated runtime suite is not evidence for venue facts.

/**
 * The reviewed Plane endpoint table: one entry per tool in `allowlist.json`.
 *
 * Plane publishes no OpenAPI document, so the endpoint an action reaches cannot
 * be read off a spec. It is read off the vendor's own call site instead, and
 * pinned by it: the MCP server calls Plane's official Python SDK
 * (`from plane import PlaneClient`), whose resource methods carry the path and
 * the verb as string literals. `fetch-inventory.mjs` records the member each
 * action calls (`sdkCalls`), and every entry below names the one it was reviewed
 * against in `sdk` - byte for byte, as the module writes it. The validator refuses
 * an entry whose `sdk` is not one of its action's recorded calls, so the table and
 * the pin cannot drift apart.
 *
 *     MCP action  ->  client.work_items.create            (recorded by the pin)
 *     SDK method  ->  POST /workspaces/{slug}/projects/{p}/work-items
 *     this table  ->  plane_workitem_create
 *
 * Where the paths came from: `plane-sdk==0.3.1`, the version the pinned MCP
 * release pins in its own `pyproject.toml`. Each path was read from that
 * release's `plane/api/**` source. The SDK builds every URL as
 * `{base_url}/api/v1` + resource base path + endpoint + `/`, so the paths here are
 * API-relative with `{workspace}` standing for the workspace slug, and the route
 * generator appends the trailing slash the SDK appends.
 *
 * What an entry may say, and nothing else:
 *
 *   - `sdk`: the vendor's call site, as the pin recorded it.
 *   - `method`, `path`: the request. `{name}` is a declared argument, encoded on
 *     the way in; `{workspace}` is the `plane.workspace_slug` secret, which is
 *     context rather than an argument, so a caller cannot redirect the request to
 *     another workspace by passing it.
 *   - `query`: `"args"` sends every non-path argument as a query parameter (what a
 *     Plane listing is); a list sends exactly those names.
 *   - `body`: `"args"` sends every non-path, non-query argument as a JSON object
 *     field (`args.x ?? undefined`, so an unspecified field is absent rather than
 *     null); a map renames or wraps them for the few bodies that are not a flat
 *     object (`{ "work_item_types": "workitem_type_ids" }`); `{ "arg": "points",
 *     "array": true }` sends that argument as the payload itself.
 *   - `requireArgs`: arguments the tool refuses to run without. Where the vendor's
 *     action forks on an argument - a project-scoped collection or a
 *     workspace-scoped one, chosen by whether `project_id` was given - a tool must
 *     still be one endpoint: the entry names the branch we ship, and `requireArgs`
 *     turns the other branch into a named refusal instead of a wrong request. The
 *     allowlist entry repeats the fact in its `flowNote`.
 *   - `note`: the sentence the generated endpoint map prints beside the tool.
 *
 * Anything this table cannot express is not shippable: a second request, a
 * multipart body, or a fork where neither branch can be refused stays out of the
 * allowlist, which says why in its `excluded` list.
 */

/** The origin every route in this table targets. */
export const API_ORIGIN = "https://api.plane.so";

/** The header the pinned SDK authenticates with. */
export const AUTH_HEADER = "x-api-key";

export const ENDPOINTS = {
  // ---------------------------------------------------------------- customers
  plane_customer_list: { sdk: "customers.list", method: "GET", path: "/workspaces/{workspace}/customers", query: "args" },
  plane_customer_retrieve: { sdk: "customers.retrieve", method: "GET", path: "/workspaces/{workspace}/customers/{customer_id}" },
  plane_customer_list_workitems: {
    sdk: "work_items.list",
    method: "GET",
    path: "/workspaces/{workspace}/customers/{customer_id}/issues",
    query: "args",
    note: "The work items linked to one customer; the vendor reaches it through its work-item resource.",
  },
  plane_customer_property_list: { sdk: "properties.list", method: "GET", path: "/workspaces/{workspace}/customer-properties", query: "args" },
  plane_customer_property_retrieve: { sdk: "properties.retrieve", method: "GET", path: "/workspaces/{workspace}/customer-properties/{property_id}" },
  plane_customer_request_list: { sdk: "requests.list", method: "GET", path: "/workspaces/{workspace}/customers/{customer_id}/requests", query: "args" },
  plane_customer_request_retrieve: { sdk: "requests.retrieve", method: "GET", path: "/workspaces/{workspace}/customers/{customer_id}/requests/{request_id}" },
  // ------------------------------------------------------------------- cycles
  plane_cycle_retrieve: { sdk: "client.cycles.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/cycles/{cycle_id}" },
  plane_cycle_list_workitems: {
    sdk: "client.cycles.list_work_items",
    method: "GET",
    path: "/workspaces/{workspace}/projects/{project_id}/cycles/{cycle_id}/cycle-issues",
    query: "args",
    note: "Work items filed in the cycle; the general work-item listing is a separate tool.",
  },
  // -------------------------------------------------------------- initiatives
  plane_initiative_list: { sdk: "client.initiatives.list", method: "GET", path: "/workspaces/{workspace}/initiatives", query: "args" },
  plane_initiative_retrieve: { sdk: "client.initiatives.retrieve", method: "GET", path: "/workspaces/{workspace}/initiatives/{initiative_id}" },
  // ------------------------------------------------------------------- intake
  plane_intake_list: { sdk: "client.intake.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/intake-issues", query: "args" },
  plane_intake_retrieve: { sdk: "client.intake.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/intake-issues/{workitem_id}" },
  // ------------------------------------------------------------------- labels
  plane_label_list: { sdk: "client.labels.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/labels", query: "args" },
  plane_label_retrieve: { sdk: "client.labels.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/labels/{label_id}" },
  // ------------------------------------------------------------------ members
  plane_member_me: { sdk: "client.users.get_me", method: "GET", path: "/users/me", noWorkspace: true, note: "Answers for the token itself, so it names no workspace in its path." },
  plane_member_list_workspace: { sdk: "client.workspaces.get_members_lite", method: "GET", path: "/workspaces/{workspace}/members-lite", query: "args" },
  plane_member_list_project: { sdk: "client.projects.get_members", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/project-members" },
  plane_member_list_roles: { sdk: "client.roles.list", method: "GET", path: "/workspaces/{workspace}/roles", query: "args", note: "`namespace` selects the workspace or the project role catalogue." },
  // --------------------------------------------------------------- milestones
  plane_milestone_list: { sdk: "client.milestones.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/milestones", query: "args" },
  plane_milestone_list_workitems: { sdk: "client.milestones.list_work_items", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/milestones/{milestone_id}/work-items", query: "args" },
  plane_milestone_retrieve: { sdk: "client.milestones.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/milestones/{milestone_id}" },
  // ------------------------------------------------------------------ modules
  plane_module_retrieve: { sdk: "client.modules.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/modules/{module_id}" },
  plane_module_list_workitems: { sdk: "client.modules.list_work_items", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/modules/{module_id}/module-issues", query: "args" },
  // -------------------------------------------------------------------- pages
  plane_page_list_workitem_pages: { sdk: "client.work_items.pages.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/pages" },
  // ----------------------------------------------------------------- projects
  plane_project_list: { sdk: "client.projects.list_lite", method: "GET", path: "/workspaces/{workspace}/projects-lite", query: "args", note: "The compact project listing the vendor's own tools read." },
  plane_project_retrieve: { sdk: "client.projects.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}" },
  plane_project_worklog_summary: { sdk: "client.projects.get_worklog_summary", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/total-worklogs" },
  plane_project_get_features: { sdk: "client.projects.get_features", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/features" },
  // -------------------------------------------------------- project estimates
  plane_project_estimate_retrieve: { sdk: "estimates.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/estimates", note: "A project has at most one estimate, so this reads a singleton rather than a list." },
  plane_project_estimate_list_points: { sdk: "estimates.list_points", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/estimates/{estimate_id}/estimate-points" },
  // ----------------------------------------------------------------- releases
  plane_release_list: { sdk: "releases.list", method: "GET", path: "/workspaces/{workspace}/releases", query: "args" },
  plane_release_retrieve: { sdk: "releases.retrieve", method: "GET", path: "/workspaces/{workspace}/releases/{release_id}" },
  plane_release_get_changelog: { sdk: "releases.changelog.retrieve", method: "GET", path: "/workspaces/{workspace}/releases/{release_id}/changelog", note: "A release has one changelog; Plane creates it empty on first read." },
  plane_release_list_workitems: { sdk: "work_items.list", method: "GET", path: "/workspaces/{workspace}/releases/{release_id}/work-items", query: "args" },
  plane_release_tag_list: { sdk: "tags.list", method: "GET", path: "/workspaces/{workspace}/releases/tags", query: "args" },
  plane_release_tag_retrieve: { sdk: "tags.retrieve", method: "GET", path: "/workspaces/{workspace}/releases/tags/{tag_id}" },
  // ------------------------------------------------------------------- states
  plane_state_list: {
    sdk: "scope.namespace.list",
    method: "GET",
    path: "/workspaces/{workspace}/projects/{project_id}/states",
    query: "args",
    requireArgs: ["project_id"],
    note: "The states of one project; the workspace-wide catalogue is not exposed.",
  },
  plane_state_retrieve: { sdk: "scope.namespace.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/states/{state_id}", requireArgs: ["project_id"] },
  // ----------------------------------------------------------------- work log
  plane_work_log_list: { sdk: "client.work_items.work_logs.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/worklogs", query: "args" },
  // ---------------------------------------------------------------- work items
  plane_workitem_retrieve: { sdk: "client.work_items.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}", query: "args" },
  plane_workitem_retrieve_by_identifier: { sdk: "client.work_items.retrieve_by_identifier", method: "GET", path: "/workspaces/{workspace}/work-items/{workitem_identifier}", query: "args", note: "`workitem_identifier` is the human key (PROJECT-123), not a UUID." },
  plane_workitem_search: { sdk: "client.work_items.search", method: "GET", path: "/workspaces/{workspace}/work-items/search", query: "args" },
  plane_workitem_activity_list: { sdk: "client.work_items.activities.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/activities", query: "args" },
  plane_workitem_attachment_list: { sdk: "client.work_items.attachments.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/attachments" },
  plane_workitem_comment_list: { sdk: "client.work_items.comments.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/comments", query: "args" },
  plane_workitem_comment_retrieve: { sdk: "client.work_items.comments.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/comments/{comment_id}" },
  plane_workitem_link_list: { sdk: "client.work_items.links.list", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/links", query: "args" },
  plane_workitem_link_retrieve: { sdk: "client.work_items.links.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/links/{link_id}" },
  // ----------------------------------------------------- work item properties
  plane_workitem_property_retrieve_option: {
    sdk: "scoped_options.retrieve",
    method: "GET",
    path: "/workspaces/{workspace}/projects/{project_id}/work-item-properties/{property_id}/options/{option_id}",
    requireArgs: ["project_id"],
    note: "The options of one project's property; the workspace-wide catalogue is not exposed.",
  },
  plane_workitem_property_get_value: { sdk: "values.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-items/{workitem_id}/work-item-properties/{property_id}/values" },
  // ---------------------------------------------------------- work item types
  plane_workitem_type_list: {
    sdk: "types.list",
    method: "GET",
    path: "/workspaces/{workspace}/projects/{project_id}/work-item-types",
    query: "args",
    requireArgs: ["project_id"],
    note: "The types of one project; the workspace-wide type catalogue is not exposed.",
  },
  plane_workitem_type_retrieve: { sdk: "types.retrieve", method: "GET", path: "/workspaces/{workspace}/projects/{project_id}/work-item-types/{workitem_type_id}", requireArgs: ["project_id"] },
  // --------------------------------------------------------------- workspaces
  plane_workspace_get_features: { sdk: "client.workspaces.get_features", method: "GET", path: "/workspaces/{workspace}/features", note: "Which workspace features are switched on." },
  // ---------------------------------------------------------------- templates
  plane_template_list: {
    sdk: "namespace.list",
    method: "GET",
    path: {
      arg: "kind",
      cases: {
        workitem: "/workspaces/{workspace}/projects/{project_id}/workitems/templates",
        page: "/workspaces/{workspace}/projects/{project_id}/pages/templates",
      },
    },
    requireArgs: ["project_id"],
    note: "One project's templates of the `kind` asked for; the workspace catalogue is not exposed.",
  },
  // -------------------------------------------------------------- collections
  plane_collection_list: { sdk: "collections.list", method: "GET", path: "/workspaces/{workspace}/collections" },
  plane_collection_retrieve: { sdk: "collections.retrieve", method: "GET", path: "/workspaces/{workspace}/collections/{collection_id}" },
  plane_collection_list_pages: { sdk: "collections.pages.list", method: "GET", path: "/workspaces/{workspace}/collections/{collection_id}/pages", query: "args" },
  plane_collection_search_pages: { sdk: "collections.pages.search", method: "GET", path: "/workspaces/{workspace}/collections/{collection_id}/pages-search", query: "args" },
  plane_collection_list_members: { sdk: "collections.members.list", method: "GET", path: "/workspaces/{workspace}/collections/{collection_id}/members" },
};



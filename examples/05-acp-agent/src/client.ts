import * as acp from "@agentclientprotocol/sdk";

// 最小 ACP Client：收集 session/update、按策略应答权限请求。
// 测试里断言收集结果；CLI/demo 里换成真实 UI 交互即可。

export type PermissionPolicy = "allow" | "reject";

export type TestClient = {
  app: ReturnType<typeof acp.client>;
  updates: acp.SessionUpdate[];
  permissionRequests: acp.RequestPermissionRequest[];
};

export function createTestClient(options: { permission?: PermissionPolicy } = {}): TestClient {
  const permission = options.permission ?? "allow";
  const updates: acp.SessionUpdate[] = [];
  const permissionRequests: acp.RequestPermissionRequest[] = [];

  const app = acp
    .client({ name: "ai-lab-test-client" })
    .onRequest("session/request_permission", (ctx) => {
      permissionRequests.push(ctx.params);
      return {
        outcome: {
          outcome: "selected" as const,
          optionId: permission === "allow" ? "allow" : "reject",
        },
      } satisfies acp.RequestPermissionResponse;
    })
    .onNotification("session/update", (ctx) => {
      updates.push(ctx.params.update);
    });

  return { app, updates, permissionRequests };
}

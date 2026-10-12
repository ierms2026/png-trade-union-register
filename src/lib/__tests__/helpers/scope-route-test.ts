import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { testDb } from "../setup";
export interface ScopedActor { id: string; role: Role; assignedUnionId: string | null; email: string; }
export interface MockAuthUser { id: string; name: string; email: string; role: Role; assignedUnionId: string | null; scopes: string[] | null; }
export function toAuthUser(actor: ScopedActor): MockAuthUser {
  return { id: actor.id, name: "Test User", email: actor.email, role: actor.role, assignedUnionId: actor.assignedUnionId, scopes: null };
}
export async function createScopedActors(unionId: string) {
  const r = await testDb.user.create({ data: { email: "reg@test.local", passwordHash: "!", role: Role.REGISTRAR } });
  const oa = await testDb.user.create({ data: { email: "off-a@test.local", passwordHash: "!", role: Role.OFFICER, assignedUnionId: unionId } });
  const ou = await testDb.user.create({ data: { email: "off-u@test.local", passwordHash: "!", role: Role.OFFICER, assignedUnionId: null } });
  return {
    registrar: { id: r.id, role: Role.REGISTRAR, assignedUnionId: null, email: r.email },
    officerAssigned: { id: oa.id, role: Role.OFFICER, assignedUnionId: unionId, email: oa.email },
    officerUnassigned: { id: ou.id, role: Role.OFFICER, assignedUnionId: null, email: ou.email },
  };
}
export function makeRequest(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: Record<string, unknown>): NextRequest {
  const init: ConstructorParameters<typeof NextRequest>[1] = { method, headers: body ? { "content-type": "application/json" } : {} };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new NextRequest(`https://example.com${path}`, init);
}

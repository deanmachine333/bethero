import { supabase } from "@/integrations/supabase/client";

export type AuditAction = "create" | "update" | "delete" | "import";

export async function logAudit(
  entity_type: string,
  entity_id: string | null,
  action: AuditAction,
  changes?: { field?: string; old_value?: unknown; new_value?: unknown },
) {
  await supabase.from("audit_log").insert({
    entity_type,
    entity_id,
    action,
    field: changes?.field ?? null,
    old_value: (changes?.old_value ?? null) as never,
    new_value: (changes?.new_value ?? null) as never,
  });
}

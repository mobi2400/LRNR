alter table user_profile enable row level security;
alter table topic_briefs enable row level security;
alter table curriculum_state enable row level security;
alter table topic_knowledge_base enable row level security;
alter table rag_memory enable row level security;
alter table job_runs enable row level security;
alter table api_idempotency_keys enable row level security;
alter table delivery_outbox enable row level security;
alter table notification_preferences enable row level security;
alter table concepts enable row level security;
alter table concept_prerequisites enable row level security;

create policy "user_profile_owner_policy"
on user_profile
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "topic_briefs_owner_policy"
on topic_briefs
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "curriculum_state_owner_policy"
on curriculum_state
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "topic_knowledge_base_owner_policy"
on topic_knowledge_base
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "rag_memory_owner_policy"
on rag_memory
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "job_runs_owner_policy"
on job_runs
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "api_idempotency_keys_owner_policy"
on api_idempotency_keys
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "delivery_outbox_owner_policy"
on delivery_outbox
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "notification_preferences_owner_policy"
on notification_preferences
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "concepts_owner_policy"
on concepts
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

create policy "concept_prerequisites_owner_policy"
on concept_prerequisites
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);
alter table workflow_node_runs enable row level security;

create policy "workflow_node_runs_owner_policy"
on workflow_node_runs
for all
to authenticated
using (auth.uid() = user_id::uuid)
with check (auth.uid() = user_id::uuid);

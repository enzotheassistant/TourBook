-- P0 hardening: add safe indexes for hot list predicates
create index if not exists idx_dates_workspace_project_status_date_created
  on public.dates (workspace_id, project_id, status, date, created_at);

create index if not exists idx_dates_workspace_project_tour_date_created
  on public.dates (workspace_id, project_id, tour_id, date, created_at);

create index if not exists idx_guest_list_entries_workspace_date_created
  on public.guest_list_entries (workspace_id, date_id, created_at);

create index if not exists idx_date_schedule_items_date_sort_created
  on public.date_schedule_items (date_id, sort_order, created_at);

-- Panel personalizado ("Mi panel"): un único panel compartido (sin login todavía),
-- reemplaza lo que antes vivía en localStorage del navegador.
create table if not exists panel_widgets (
  id text primary key,           -- instancia del widget en el panel (ej. "w-1758150000000")
  widget_id text not null,       -- clave del catálogo (ej. "ventas.consolidadoHoy")
  x integer not null default 0,
  y integer not null default 0,
  w integer not null default 1,
  h integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Sin autenticación de usuarios en la app todavía: se habilita RLS pero con una
-- política abierta para la anon key (dato de layout, no sensible). Si más
-- adelante se agrega login, esto se reemplaza por políticas por usuario.
alter table panel_widgets enable row level security;

create policy "anon puede leer panel_widgets"
  on panel_widgets for select
  to anon
  using (true);

create policy "anon puede escribir panel_widgets"
  on panel_widgets for insert
  to anon
  with check (true);

create policy "anon puede actualizar panel_widgets"
  on panel_widgets for update
  to anon
  using (true);

create policy "anon puede borrar panel_widgets"
  on panel_widgets for delete
  to anon
  using (true);

-- ============================================================
-- PILATES ROOM @ Centro Oils&Love — SEED OFICIAL
-- Fecha: 2026-04-26
-- Source of truth: brief del cliente + material gráfico oficial.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. LIMPIAR DATOS VIEJOS
-- ============================================================
DELETE FROM classes;
DELETE FROM schedules;
DELETE FROM class_types;
UPDATE plans SET is_active = false;
DELETE FROM plans;

-- ============================================================
-- 2. SYSTEM SETTINGS
-- ============================================================
UPDATE system_settings SET value = '{
  "name": "Pilates Room",
  "address": "Centro Oils&Love, Jardines del Country, Guadalajara, Jalisco",
  "phone": "",
  "email": "",
  "social_media": {}
}'::jsonb WHERE key = 'studio_info';

-- Política oficial: cancelación 12h antes, 2 reagendas/mes (3a se cobra)
UPDATE system_settings SET value = '{
  "cancellation_hours": 12,
  "no_show_penalty": true,
  "max_advance_days": 30,
  "tolerance_minutes": 10,
  "reschedules_per_month": 2
}'::jsonb WHERE key = 'booking_policies';

-- ============================================================
-- 3. CLASS TYPE — único: Pilates Reformer
-- ============================================================
INSERT INTO class_types (id, name, description, level, duration_minutes, max_capacity, icon, color, is_active)
VALUES
  ('a1000001-0001-4000-8000-000000000001',
   'Pilates Reformer',
   'Fortalece todo tu cuerpo y mente con nuestras clases personalizadas de 50 min de Pilates Reformer. Son de bajo impacto articular gracias a las resistencias ajustables de la máquina, sin olvidarnos de una relajación final.',
   'all', 50, 6, 'waves', '#725D51', true);

-- ============================================================
-- 4. PLANS — Pricing oficial Pilates Reformer (vigencia 30 días)
-- ============================================================
INSERT INTO plans (id, name, description, price, currency, duration_days, class_limit, features, is_active, sort_order)
VALUES
  ('b2000001-0001-4000-8000-000000000001',
   'Clase de prueba',
   'Sesión de prueba para nuevas alumnas. Ideal para conocer el método y el espacio.',
   200.00, 'MXN', 7, 1,
   '["1 clase de prueba", "Para nuevas alumnas", "Válida 7 días"]'::jsonb,
   true, 0),

  ('b2000001-0001-4000-8000-000000000002',
   '4 clases',
   'Paquete de 4 clases. Vigencia 30 días.',
   860.00, 'MXN', 30, 4,
   '["4 clases", "Vigencia 30 días", "Pago en la app"]'::jsonb,
   true, 1),

  ('b2000001-0001-4000-8000-000000000003',
   '8 clases',
   'Paquete de 8 clases. Vigencia 30 días.',
   1410.00, 'MXN', 30, 8,
   '["8 clases", "Vigencia 30 días", "Pago en la app"]'::jsonb,
   true, 2),

  ('b2000001-0001-4000-8000-000000000004',
   '10 clases',
   'Paquete de 10 clases. Vigencia 30 días.',
   1590.00, 'MXN', 30, 10,
   '["10 clases", "Vigencia 30 días", "Pago en la app"]'::jsonb,
   true, 3),

  ('b2000001-0001-4000-8000-000000000005',
   '12 clases',
   'Paquete de 12 clases. Vigencia 30 días.',
   1790.00, 'MXN', 30, 12,
   '["12 clases", "Vigencia 30 días", "Pago en la app"]'::jsonb,
   true, 4),

  ('b2000001-0001-4000-8000-000000000006',
   '16 clases',
   'Paquete de 16 clases. Vigencia 30 días.',
   2040.00, 'MXN', 30, 16,
   '["16 clases", "Vigencia 30 días", "Pago en la app"]'::jsonb,
   true, 5),

  ('b2000001-0001-4000-8000-000000000007',
   '20 clases',
   'Paquete de 20 clases. Vigencia 30 días.',
   2190.00, 'MXN', 30, 20,
   '["20 clases", "Vigencia 30 días", "Pago en la app"]'::jsonb,
   true, 6);

-- ============================================================
-- 5. ADMIN USER + INSTRUCTOR
-- ============================================================
INSERT INTO users (id, email, phone, display_name, role, is_active)
VALUES (
  'c3000001-0001-4000-8000-000000000001',
  'admin@pilatesroom.com',
  '0000000000',
  'Administradora Pilates Room',
  'admin',
  true
) ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, phone, display_name, role, is_active)
VALUES (
  'c3000001-0001-4000-8000-000000000002',
  'instructora@pilatesroom.com',
  '0000000001',
  'Instructora Pilates Room',
  'instructor',
  true
) ON CONFLICT (email) DO NOTHING;

INSERT INTO instructors (id, user_id, display_name, bio, specialties, is_active)
VALUES (
  'd4000001-0001-4000-8000-000000000001',
  'c3000001-0001-4000-8000-000000000002',
  'Instructora Pilates Room',
  'Instructora certificada en Pilates Reformer.',
  '["Pilates Reformer"]'::jsonb,
  true
) ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. SCHEDULES — Horario semanal recurrente (oficial cliente)
-- ============================================================
-- day_of_week: 0=Domingo, 1=Lunes, ..., 6=Sábado
-- Lunes a viernes: 7:30, 8:30, 17:00, 18:00, 19:30
-- Martes y jueves añaden 9:30
-- Sábado: 8:00, 9:15
-- Domingo: 9:00, 10:00
-- Duración 50 min → end_time = start_time + 50 min
-- Capacidad: 6

-- ── LUNES (1) ──
INSERT INTO schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active) VALUES
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 1, '07:30', '08:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 1, '08:30', '09:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 1, '17:00', '17:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 1, '18:00', '18:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 1, '19:30', '20:20', 6, true, true);

-- ── MARTES (2) — añade 9:30 ──
INSERT INTO schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active) VALUES
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 2, '07:30', '08:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 2, '08:30', '09:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 2, '09:30', '10:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 2, '17:00', '17:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 2, '18:00', '18:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 2, '19:30', '20:20', 6, true, true);

-- ── MIÉRCOLES (3) ──
INSERT INTO schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active) VALUES
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 3, '07:30', '08:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 3, '08:30', '09:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 3, '17:00', '17:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 3, '18:00', '18:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 3, '19:30', '20:20', 6, true, true);

-- ── JUEVES (4) — añade 9:30 ──
INSERT INTO schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active) VALUES
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 4, '07:30', '08:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 4, '08:30', '09:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 4, '09:30', '10:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 4, '17:00', '17:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 4, '18:00', '18:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 4, '19:30', '20:20', 6, true, true);

-- ── VIERNES (5) ──
INSERT INTO schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active) VALUES
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 5, '07:30', '08:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 5, '08:30', '09:20', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 5, '17:00', '17:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 5, '18:00', '18:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 5, '19:30', '20:20', 6, true, true);

-- ── SÁBADO (6) ──
INSERT INTO schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active) VALUES
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 6, '08:00', '08:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 6, '09:15', '10:05', 6, true, true);

-- ── DOMINGO (0) ──
INSERT INTO schedules (class_type_id, instructor_id, day_of_week, start_time, end_time, max_capacity, is_recurring, is_active) VALUES
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 0, '09:00', '09:50', 6, true, true),
('a1000001-0001-4000-8000-000000000001', 'd4000001-0001-4000-8000-000000000001', 0, '10:00', '10:50', 6, true, true);

-- ============================================================
-- 7. CLASSES — Generar las próximas 4 semanas
-- ============================================================
DO $$
DECLARE
  rec RECORD;
  week_offset INT;
  target_date DATE;
  base_monday DATE;
BEGIN
  base_monday := date_trunc('week', CURRENT_DATE)::date;

  FOR week_offset IN 0..3 LOOP
    FOR rec IN SELECT * FROM schedules WHERE is_recurring = true AND is_active = true LOOP
      -- day_of_week 0 = Domingo: cae 6 días después del lunes base
      IF rec.day_of_week = 0 THEN
        target_date := base_monday + (week_offset * 7) + 6;
      ELSE
        target_date := base_monday + (week_offset * 7) + (rec.day_of_week - 1);
      END IF;

      IF target_date >= CURRENT_DATE THEN
        INSERT INTO classes (
          schedule_id, class_type_id, instructor_id,
          date, start_time, end_time,
          max_capacity, current_bookings, status
        ) VALUES (
          rec.id, rec.class_type_id, rec.instructor_id,
          target_date, rec.start_time, rec.end_time,
          rec.max_capacity, 0, 'scheduled'
        )
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE '✅ Clases generadas para las próximas 4 semanas';
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
SELECT '--- CLASS TYPES ---' AS info;
SELECT name, color, duration_minutes, max_capacity FROM class_types WHERE is_active = true;

SELECT '--- PLANS ---' AS info;
SELECT name, price, class_limit, sort_order FROM plans WHERE is_active = true ORDER BY sort_order;

SELECT '--- SCHEDULES ---' AS info;
SELECT s.day_of_week, s.start_time, ct.name AS class_name
FROM schedules s
JOIN class_types ct ON s.class_type_id = ct.id
WHERE s.is_active = true
ORDER BY s.day_of_week, s.start_time;

SELECT '--- CLASSES (próximas) ---' AS info;
SELECT c.date, c.start_time, ct.name AS class_name, c.status
FROM classes c
JOIN class_types ct ON c.class_type_id = ct.id
WHERE c.date >= CURRENT_DATE
ORDER BY c.date, c.start_time
LIMIT 30;

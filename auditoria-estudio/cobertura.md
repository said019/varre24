# Cobertura de escenarios — VARRE24 (Fases 2 y 3)

**Método:** 14 auditores paralelos (uno por dominio + 2 de edge cases) con evidencia archivo:línea obligatoria; los 26 escenarios 🔴 críticos pasaron por verificación adversarial independiente (14 por agente verificador, 12 por el auditor principal). Overrides aplicados: D2 ✅→⚠️ (verificador); nota operativa en L6.

**Cobertura global: 54%** — ✅ 37 · ⚠️ 63 · ❌ 27 · ➖ 8 · ❓ 1 (de 136 escenarios)


## A — Registro e identidad  ·  cobertura 60% 🟡

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| A1 | 🟠 | ✅ | backend/server/index.js:2865-2908 POST /api/auth/register (nombre, email, teléfono, género, DOB, password, términos); frontend/src/pages/auth/Register.tsx:12-40 schema Zod con phone requerido (7-15 dígitos) y selector de país; backend/server/index.js:9530-9538 normalizePhoneForStorage normaliza a +52. Nota: NO hay verificación OTP del teléfono (grep 'otp\|OTP' sin resultados en auth) y el backend no exige phone (index.js:2867 solo requiere email/password/displayName), pero la matriz marca OTP como 'si es posible' y el formato sí se valida. |
| A2 | 🟠 | ✅ | backend/server/index.js:2947-2987 POST /api/auth/forgot-password (token 32 bytes, expira 2h, anti-enumeración, invalida tokens previos) + 2990-3047 POST /api/auth/reset-password (transaccional, FOR UPDATE, token single-use, isStrongPassword); tabla password_reset_tokens index.js:524-537; email via sendPasswordResetEmail con link a /auth/reset-password (2975-2980); páginas frontend/src/pages/auth/ForgotPassword.tsx y ResetPassword.tsx existen. Respaldo: admin reset con tempPassword index.js:10847-10872. Es por email (no WhatsApp/SMS), lo cual la matriz acepta explícitamente. |
| A3 | 🟠 | ⚠️ | backend/server/index.js:8057-8110 PUT /api/users/:id permite a la clienta editar su propio phone (y admin editar cualquiera); frontend/src/pages/client/ProfileEdit.tsx:22,114 campo teléfono con regex +52. Propagación OK para WhatsApp: los envíos leen users.phone al momento (index.js:9868, 9921-9925, 11000). PERO ninguna ruta actualiza users.email: el UPDATE de 8077-8092 no incluye email y grep 'SET email' no arroja ningún endpoint. |
| A4 | 🟠 | ⚠️ | Columna users.health_notes existe (backend/server/index.js:517) y es editable por la clienta (frontend/src/pages/client/ProfileEdit.tsx:27,149) y por admin al dar de alta (index.js:10790-10803) y en ClientDetail/ClientsList. PERO: (1) el registro NO pregunta nada de salud (grep 'salud\|lesion\|embaraz\|health' en Register.tsx = 0 resultados); (2) el roster de clase GET /api/classes/:id/roster (index.js:12228-12248) NO selecciona health_notes, y ninguna vista de clase del admin (BookingsList.tsx, ClassesCalendar.tsx) muestra healthNotes — la instructora tendría que abrir el perfil de cada alumna una por una. |
| A5 | 🟡 | ⚠️ | Columna users.accepts_terms (backend/server/index.js:510) se guarda en el registro (index.js:2878-2881); checkbox obligatorio en frontend/src/pages/auth/Register.tsx:35 (refine) y 227-241; texto de reglamento existe (frontend/src/pages/legal/Terminos.tsx y settings terms_of_service index.js:204). PERO es un booleano sin fecha ni versión de aceptación (no hay accepted_at/terms_version en schema), no existe re-aceptación si cambia la versión, el link del checkbox es href="#" (Register.tsx:238, no lleva al texto real), y el alta admin marca accepts_terms=true sin firma de la clienta (index.js:10802). |
| A6 | 🟡 | ⚠️ | date_of_birth existe (backend/server/index.js:514) y es requerido en el registro con gate de edad 10-100 años (frontend/src/pages/auth/Register.tsx:20-28), así que el dato para detectar menores está. PERO la validación es solo frontend (backend index.js:2876 acepta cualquier DOB o null sin validar edad), una menor de 10-17 años se auto-registra sin fricción, y no existe concepto de tutor (grep 'tutor\|menor de edad\|guardian\|parental' = 0 resultados en backend y Register.tsx). |
| A7 | 🟠 | ✅ | backend/server/index.js:10788-10810 POST /api/users (adminMiddleware): alta con datos mínimos (email + nombre; teléfono/DOB/salud opcionales), genera tempPassword y lo devuelve al admin para entregarlo; email normalizado igual que login (10794) y UNIQUE con 409 evita duplicar (10795-10796). La clienta reclama su cuenta después: entra con la temporal y la cambia (POST /api/auth/change-password index.js:3051) o usa forgot-password por email (2947); el admin también puede resetearla (10847-10872). UI en frontend/src/pages/admin/clients/ClientsList.tsx (form con zod, contacto de emergencia, etc.). Alta express adicional en flujo walk-in (index.js:12462-12488). |
| A8 | 🟡 | ⚠️ | Plan 'Clase de prueba' seed con repeat_key 'trial_single_session' e is_non_repeatable (backend/server/index.js:892-896); marcado como trial vía isTrialPlan (2172-2175); límite de 1 por persona sí se aplica: findNonRepeatablePlanConflict (2662-2731) bloquea por membership u order previa con mensajes explícitos ('no se puede repetir' 2691, 'sesión muestra en proceso' 2720, 'ya fue utilizada' 2726); reglas extra: sin invitada en trial (3480-3485), restricción de horarios desactivada a propósito (2163-2175). PERO no hay seguimiento de conversión trial→paquete (grep 'conversion\|conversión\|convirti' = 0 resultados): nadie sabe qué % de clases muestra compraron después. |
| A9 | 🟡 | ⚠️ | El aviso de privacidad documenta el proceso ARCO por correo a hola@varre24.com (frontend/src/pages/legal/Privacidad.tsx:94-96, con lista de requisitos). El borrado existe solo como DELETE /api/users/:id admin-only con hard DELETE sin confirmación ni motivo (backend/server/index.js:10875-10883); las FKs son mezcla de ON DELETE CASCADE y SET NULL (índices en 527, 973, 1076, 1567), así que parte del historial se borra en cascada y parte queda huérfano. No existe autoservicio ('eliminar mi cuenta' = 0 resultados en frontend/src/pages/client) ni anonimización que conserve el historial contable. |
| A10 | 🟡 | ❌ | No existe ninguna herramienta de merge de usuarias: grep -n 'merge\|duplicad' en backend/server/index.js solo encuentra deepMerge de settings (línea 288) y un dedup automático de class_types 'Pilates Reformer' (671-695), nada sobre users; en frontend/src/pages/admin/clients/* no hay UI de duplicados. El email es UNIQUE pero users.phone no (index.js:502 sin UNIQUE), así que la misma persona con dos correos o el mismo teléfono en dos cuentas es perfectamente posible. |

### Gaps de A — qué pasa hoy / qué debería pasar

**A3 ⚠️ 🟠**
- *Hoy:* La clienta puede cambiar teléfono, contacto de emergencia y notas de salud, pero el email es inmutable para siempre — ni ella ni el admin pueden corregirlo; si pierde acceso a ese correo, la recuperación de contraseña (que es solo por email) y los recibos mueren.
- *Debería:* Permitir cambio de email (al menos desde admin, idealmente self-service con confirmación al correo nuevo), manteniendo la normalización lowercase y el UNIQUE.
- *Dónde vive el fix:* backend/server/index.js PUT /api/users/:id (o endpoint dedicado de cambio de email con re-verificación) + frontend/src/pages/client/ProfileEdit.tsx y admin ClientDetail.tsx

**A4 ⚠️ 🟠**
- *Hoy:* Las notas de salud son un campo de texto libre que solo se ve en el perfil individual de la clienta en admin; en la lista de la clase la instructora no ve alertas de lesión/embarazo, y a nadie se le pregunta al registrarse.
- *Debería:* Cuestionario de salud básico al registrarse (o al primer booking) y badge/alerta de health_notes visible en el roster de cada clase para la instructora.
- *Dónde vive el fix:* backend/server/index.js GET /api/classes/:id/roster (agregar u.health_notes al SELECT) + frontend admin/bookings/BookingsList.tsx o vista de roster; opcionalmente paso de salud/PAR-Q en Register.tsx o primer login

**A5 ⚠️ 🟡**
- *Hoy:* Solo un booleano true/false sin trazabilidad: no se puede probar cuándo ni qué versión aceptó; si el estudio cambia el reglamento nadie re-acepta.
- *Debería:* Guardar fecha y versión al aceptar, forzar re-aceptación cuando cambie la versión, y que el checkbox enlace al texto vigente.
- *Dónde vive el fix:* Tabla users (columnas terms_accepted_at, terms_version) o tabla waiver_acceptances; backend/server/index.js register + middleware de re-aceptación; frontend Register.tsx (link real a /legal/terminos)

**A6 ⚠️ 🟡**
- *Hoy:* Se captura la fecha de nacimiento pero nada pasa con ella: menores de edad (10-17) crean cuenta igual que adultas, sin autorización ni datos de tutor.
- *Debería:* Detectar <18 con la DOB en el servidor y, según política del estudio, pedir nombre/teléfono/consentimiento del tutor o bloquear el auto-registro con mensaje de acudir al estudio.
- *Dónde vive el fix:* backend/server/index.js POST /api/auth/register (validación server-side de edad) + Register.tsx (flujo condicional de tutor) + columnas guardian_name/guardian_phone en users

**A8 ⚠️ 🟡**
- *Hoy:* El trial funciona y es de un solo uso, pero la conversión es invisible: no hay métrica de cuántas clientas de clase muestra compraron paquete.
- *Debería:* Reporte de conversión de trials (tomaron muestra → compraron dentro de X días) para que la dueña mida el funnel.
- *Dónde vive el fix:* backend/server/index.js reportes admin (GET /api/admin/reports o nuevo endpoint) + frontend admin reports: cohorte de usuarias con membership trial_single_session y si compraron un plan posterior

**A9 ⚠️ 🟡**
- *Hoy:* La clienta solo puede pedirlo por email; el admin únicamente tiene un hard delete que arrasa con pagos/reservas en cascada (se pierde historial contable) y nada define qué pasa con un paquete activo.
- *Debería:* Flujo de cancelación de datos que anonimice la cuenta conservando órdenes/asistencias sin datos personales, con regla explícita para paquetes vigentes.
- *Dónde vive el fix:* backend/server/index.js: endpoint de anonimización (UPDATE users SET display_name/email/phone/health_notes a valores anónimos + is_active=false) en vez del DELETE crudo; frontend/src/pages/client/Profile.tsx botón de solicitud; política definida para membership activa

**A10 ❌ 🟡**
- *Hoy:* Si recepción da de alta a 'María Perez' y ella luego se registra como 'María Pérez' con otro correo, quedan dos perfiles con pagos y clases repartidos, y la única salida es borrar uno perdiendo su historial.
- *Debería:* Detección de posibles duplicados (mismo teléfono, nombre similar) y merge que conserve pagos, membresías, reservas y puntos de ambas cuentas.
- *Dónde vive el fix:* backend/server/index.js: endpoint POST /api/admin/users/:id/merge (reasignar memberships, bookings, orders, loyalty_transactions, notifications al usuario canónico y desactivar el duplicado) + detección por phone/nombre similar; UI en frontend/src/pages/admin/clients/ClientsList.tsx


## B — Horarios y reservas  ·  cobertura 46% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| B1 ✔︎ver | 🔴 | ⚠️ | backend/server/index.js:3231 GET /api/classes calcula cupos EN VIVO con LEFT JOIN agregado bc.cnt (líneas 3253-3264, cuenta confirmed/checked_in y alumna+invitada=2) y devuelve class_type_name, instructor_name, capacity. Frontend: la landing components/Schedule.tsx:177-187 y 418-419 sí muestra lugares disponibles e instructora; el detalle BookClassConfirm.tsx:140-142 muestra '{used} / {cap} lugares'. PERO el calendario de reserva de la clienta (pages/client/BookClasses.tsx:356-418) solo pinta tipo de clase, hora, '50 min' y botón 'Reservar' — sin instructora ni cupos por tarjeta. |
| B2 ✔︎ver | 🔴 | ✅ | backend/server/index.js:3377 POST /api/bookings — transacción con lock FOR UPDATE de la clase (3393-3399) y de la membresía (3455-3458); selectMembershipForClass elige membresía que cubre la FECHA de la clase (3420-3427); valida compatibilidad de categoría (3465), créditos suficientes (3489), duplicado (3499); descuenta el crédito correcto (3533-3539) con bitácora logCreditChange (3540-3548) y confirma al instante con email/WhatsApp (3554-3596). Frontend en pocos taps: BookClasses.tsx:370 navega al detalle y BookClassConfirm.tsx:64-95 confirma con un botón. |
| B3 | 🟠 | ➖ | N/A por perfil de operación: estudio mat/barre con cupo 7 SIN camas numeradas. Consistente con el código: la tabla bookings (schema_complete.sql:458-472) no tiene columna de asiento/cama (seat/spot_number inexistente, grep sin resultados en backend/server/index.js) y el cupo se maneja como contador classes.current_bookings. |
| B4 | 🟠 | ⚠️ | backend/server/index.js:3520-3521 — si used >= cap la reserva se crea con status='waitlist' (no descuenta crédito, 3528) y responde 'Añadido a lista de espera' (3602). MyBookings.tsx:28 muestra badge 'Lista de espera'. PERO la posición NUNCA se guarda ni se muestra a la clienta: el INSERT (3522-3525) no llena bookings.waitlist_position (columna existe en schema_complete.sql:464 pero queda NULL); solo el admin ve posiciones derivadas del orden (admin/bookings/Waitlist.tsx:140 'Posición {idx+1}'). |
| B5 | 🟠 | ❌ | backend/server/index.js:3731-3734 — al cancelar, DELETE /api/bookings/:id solo decrementa current_bookings; el comentario en 3730 dice 'el cupo queda libre para waitlist' pero NO existe código de promoción: grep -n de promot/promov/notifyWaitlist no arroja nada; la tabla waitlist solo aparece en DELETE FROM (8705, 13916). El toast del cliente promete 'Te avisaremos si se libera un lugar' (BookClassConfirm.tsx:79) pero ningún proceso avisa ni confirma. Admin Waitlist.tsx es solo lectura (sin botón de promover). |
| B6 | 🟡 | ❌ | backend/server/index.js:274-282 DEFAULT_SETTINGS_BY_KEY solo contiene cancellation_window (253-264); no existe ninguna key booking_window ni setting de anticipación (grep booking_window/advance_booking/anticipaci sin resultados de reserva). POST /api/bookings (3377-3612) no valida fecha/hora de la clase contra NOW(): ni apertura N días antes, ni cierre X horas antes — la API incluso acepta reservar una clase ya iniciada o pasada (solo el frontend deshabilita tarjetas pasadas, BookClasses.tsx:357,364). |
| B7 | 🟡 | ❌ | El único límite es no duplicar LA MISMA clase: backend/server/index.js:3499-3506 (y UNIQUE(class_id,user_id) en schema_complete.sql:471). No hay máximo de reservas simultáneas, ni máximo por día/semana, ni bloqueo de clases empalmadas (grep max_bookings/bookings_per_day/empalm/overlap: sin resultados). El plan 'Membresía mensual' vende 'Hasta 3 clases por semana' (index.js:899) pero ese tope semanal no se aplica en ningún lado — solo el total de 12 créditos. |
| B8 ✔︎ver | 🔴 | ⚠️ | Backend bloquea con mensajes claros y códigos: sin membresía 403 'No tienes membresía activa con créditos' (backend/server/index.js:3449-3451), vencimiento con código CLASS_AFTER_MEMBERSHIP_EXPIRY y fechas (3441-3448), sin créditos código NO_CREDITS 'Renueva o adquiere un nuevo plan' (3489-3496). Frontend: BookClasses.tsx:264-272 muestra banner con CTA directo 'Adquiere un plan' → /app/checkout cuando no hay membresía. PERO en la pantalla de confirmación, sin créditos solo aparece el aviso 'Ya no te quedan créditos en tu paquete' y el botón se deshabilita (BookClassConfirm.tsx:196-201, 209-212) SIN link a comprar/renovar, y los 403 del backend caen en un toast genérico (88-94) que no disting |
| B9 | 🟡 | ✅ | backend/server/index.js:3379-3385 POST /api/bookings acepta guestName/guestPhone y fija creditsNeeded=2 y slotsNeeded=2; exige 2 créditos con código NOT_ENOUGH_CREDITS_FOR_GUEST (3489-3496) y 2 lugares libres sin waitlist con NOT_ENOUGH_SPOTS_FOR_GUEST (3508-3519); descuenta 2 créditos con razón booking_created_with_guest (3533-3548); la invitada queda registrada con datos mínimos en bookings.guest_name/guest_phone (3523-3525). Prohibida en Clase Muestra (3481-3487). UI: BookClassConfirm.tsx:145-190 switch 'Llevar invitada' con nombre y teléfono ('Se cobrarán 2 créditos... y se ocupan 2 lugares', línea 162). Quitar solo a la invitada: DELETE /api/bookings/:id/guest (3828). Nota menor: la inv |
| B10 | ⚪ | ❌ | grep -rn de recurr/recurring/'todas las semanas' en backend/server/index.js y frontend/src: cero resultados de reservas recurrentes de clienta (solo el horario semanal del estudio en components/landing/Horarios.tsx:73 y el duplicado de CLASES del admin POST /api/admin/classes/duplicate-week index.js:8744, que copia clases, no reservas). POST /api/bookings solo acepta un classId a la vez (3378). |
| B11 | 🟡 | ❌ | Existe marcaje MANUAL de no-show (PUT /api/bookings/:id/no-show backend/server/index.js:12136 y PUT /api/admin/bookings/:id/mark-no-show 12376 con refund opcional, crédito perdido por defecto), pero NO hay strikes ni bloqueo automático: grep strike/no_show_count/penal solo encuentra texto de política ($70 en 203/263, no aplicado en código); los únicos COUNT de no_show son de reportes (9132, 9262). Peor: el cron runAutoCheckin (14947-14972, cada 10 min línea 15310) marca checked_in automático TODAS las confirmadas al terminar la clase, así que la falta queda registrada como asistencia salvo que el admin la marque antes. |
| B12 | 🟠 | ✅ | backend/server/index.js:3340-3374 GET /api/bookings/my-bookings devuelve todas las reservas de la clienta con fecha, hora, instructora, status y has_review. Frontend MyBookings.tsx: tabs 'Próximas' y 'Pasadas' (líneas 320-328), filtros upcoming (confirmed/waitlist futuras, 197-199) y past (200), badge de asistencia para checked_in (118) y labels de status incluida 'Lista de espera' (28). |
| B13 | 🟠 | ✅ | backend/server/index.js:11901 POST /api/admin/bookings/assign reserva a nombre de cualquier clienta con las MISMAS validaciones del flujo cliente: membresía que cubre la fecha (11935-11940), locks FOR UPDATE de clase y membresía (11915-11920, 11946-11948), créditos (11980-11988), duplicado (11990-11997), capacidad con caída a waitlist (11999-12010) y descuento con logCreditChange (12017-12030). UI: admin/bookings/BookingsList.tsx botón 'Asignar miembro' (línea 239) con buscador de clientas (80) e incluso invitada (138-140); complemento walk-in POST /api/admin/classes/:id/walkin (12268). |

### Gaps de B — qué pasa hoy / qué debería pasar

**B1 ⚠️ 🔴**
- *Hoy:* La clienta no ve lugares disponibles ni instructora en el calendario; tiene que abrir clase por clase (/app/classes/:id) para ver '{used}/{cap} lugares'. El dato en vivo ya viaja en la respuesta de GET /api/classes pero la tarjeta lo ignora.
- *Debería:* Mostrar en cada tarjeta del calendario los cupos disponibles en tiempo real (ej. '3/7 lugares') y la instructora, usando current_bookings/max_capacity que ya llegan del API.
- *Dónde vive el fix:* frontend/src/pages/client/BookClasses.tsx (tarjetas de clase del calendario semanal)

**B4 ⚠️ 🟠**
- *Hoy:* La clienta queda en waitlist pero solo ve el texto 'Lista de espera' sin posición; no sabe si es la #1 o la #5. bookings.waitlist_position queda NULL siempre.
- *Debería:* Al caer en waitlist, calcular la posición (COUNT de waitlist previos de esa clase), guardarla en waitlist_position y mostrarla en la confirmación y en 'Mis reservas'.
- *Dónde vive el fix:* POST /api/bookings (calcular y devolver posición) + frontend/src/pages/client/MyBookings.tsx y toast de BookClassConfirm.tsx:79 (mostrarla)

**B5 ❌ 🟠**
- *Hoy:* Cuando alguien cancela, el lugar queda libre pero las de waitlist se quedan en 'waitlist' para siempre (sin crédito descontado y sin lugar); quien gana el lugar es la primera que refresque el calendario, no la primera de la lista. Nadie recibe aviso.
- *Debería:* Al liberarse un cupo, promover automáticamente al primer booking en waitlist (descontando su crédito) o notificarla con ventana de confirmación; si no confirma, pasar a la siguiente.
- *Dónde vive el fix:* DELETE /api/bookings/:id y PUT /api/admin/bookings/:id/cancel (hook al liberar cupo) o cron en backend/server/index.js; notificación vía sendConfiguredWhatsAppTemplate/email ya existentes

**B6 ❌ 🟡**
- *Hoy:* Cualquier clase visible es reservable en cualquier momento; no hay control de 'abre 7 días antes / cierra 1 h antes' y por API se puede reservar una clase que ya ocurrió (consumiendo crédito).
- *Debería:* Ventana de reserva configurable desde admin (días de apertura y horas de cierre) validada en el backend, con al menos el bloqueo de clases ya iniciadas/pasadas.
- *Dónde vive el fix:* settings (nueva key booking_window en DEFAULT_SETTINGS_BY_KEY) + validación en POST /api/bookings y POST /api/admin/bookings/assign + pantalla admin Settings

**B7 ❌ 🟡**
- *Hoy:* Una clienta con créditos puede reservar todas las clases de la semana el mismo día (acaparar cupo 7) e incluso dos clases a la misma hora en horarios distintos; el '3 por semana' del plan es solo texto de marketing.
- *Debería:* Límites configurables: reservas activas simultáneas máximas, máximo por día/semana según plan y rechazo de reservas que se empalman en horario.
- *Dónde vive el fix:* POST /api/bookings y POST /api/admin/bookings/assign (validaciones) + settings configurables + plans (columna de tope semanal)

**B8 ⚠️ 🔴**
- *Hoy:* La clienta sin créditos o con membresía vencida ve el motivo pero queda en un callejón: sin botón para ir a /app/checkout desde la pantalla de reserva; debe navegar sola.
- *Debería:* En el aviso de sin créditos y en el onError (códigos NO_CREDITS / CLASS_AFTER_MEMBERSHIP_EXPIRY) mostrar CTA directo 'Renovar / Comprar plan' hacia /app/checkout.
- *Dónde vive el fix:* frontend/src/pages/client/BookClassConfirm.tsx (aviso notEnoughCredits y handler onError)

**B10 ❌ ⚪**
- *Hoy:* La clienta que toma la misma clase todos los martes debe repetir el flujo de reserva semana por semana.
- *Debería:* Opción de reservar la misma clase N semanas adelante en un solo paso, respetando saldo de créditos y avisando cuántas semanas alcanzó a cubrir.
- *Dónde vive el fix:* POST /api/bookings (modo batch/recurrente) + frontend/src/pages/client/BookClassConfirm.tsx (opción 'reservar todas las semanas')

**B11 ❌ 🟡**
- *Hoy:* No se acumulan strikes ni se bloquea a nadie; el auto-checkin incluso convierte no-shows no marcados en asistencias, borrando la señal para cualquier política futura.
- *Debería:* Contar no-shows por clienta en ventana móvil y aplicar automáticamente la política configurada (strike, bloqueo temporal de reserva anticipada), además de marcar no_show —no checked_in— a quien no hizo check-in.
- *Dónde vive el fix:* backend/server/index.js — contador de no-shows por clienta (users o query sobre bookings), política configurable en settings, y hook en los endpoints de no-show + validación en POST /api/bookings


## C — Cancelaciones, cambios y waitlist  ·  cobertura 38% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| C1 ✔︎ver | 🔴 | ⚠️ | backend/server/index.js:3628 DELETE /api/bookings/:id — devuelve crédito dentro de ventana (líneas 3736-3751, sujeto a cupo free_cancellations_per_membership default 1, línea 260) y libera el lugar (3731-3734 UPDATE classes SET current_bookings - slots); notifica a la que cancela por email/WA (3768-3800). PERO grep -n waitlist en todo index.js no encuentra ninguna transición waitlist→confirmed ni aviso al liberar cupo: no existe promoción de waitlist (B5) en ninguna parte. |
| C2 | 🟠 | ✅ | backend/server/index.js:3698-3704 — bloquea con code CANCELLATION_WINDOW_EXCEEDED y late_cancel_message configurable (settings cancellation_window, defaults en líneas 253-263: min_hours 4, mensaje editable); frontend/src/pages/client/MyBookings.tsx:352-408 — diálogo de confirmación con 3 variantes (free/penalty/blocked) que le dice ANTES de confirmar si se devuelve crédito, si la clase se cuenta como tomada, o si ya no se puede cancelar; MyBookings.tsx:100-101 muestra el aviso en la tarjeta cuando ya está fuera de ventana. Nota: la 'penalización de $70 MXN' del mensaje default es solo texto informativo, no hay cobro automático (se gestiona fuera del sistema). |
| C3 | 🟠 | ⚠️ | backend/server/index.js:12136 PUT /api/bookings/:id/no-show y 12376 PUT /api/admin/bookings/:id/mark-no-show (con refundCredit opcional) — ambos MANUALES. No hay marcado automático al cierre; al contrario: runAutoCheckin (index.js:14947-14963, cron cada 10 min en línea 15310) marca checked_in TODAS las reservas 'confirmed' cuya clase ya terminó. grep strike/no_show_count → 0: no hay política de strikes (B11). |
| C4 | 🟡 | ❌ | grep -n reschedule/reagend en backend/server/index.js y frontend/src → 0 resultados. No existe endpoint ni pantalla de reagendado; el único camino es DELETE /api/bookings/:id (3628) seguido de POST /api/bookings (3377), dos llamadas independientes. |
| C5 ✔︎ver | 🔴 | ❌ | backend/server/index.js:8663-8669 PUT /api/classes/:id/cancel — SOLO hace UPDATE classes SET status='cancelled'; no cancela las bookings, no devuelve créditos, no notifica ni sugiere alternativas. La UI admin (frontend/src/pages/admin/classes/ClassesCalendar.tsx:681 y 1227 'Cancelar clase') llama a ese endpoint sin más. Agravante: las reservas siguen 'confirmed' y runAutoCheckin (index.js:14947, sin filtro por c.status) las marca checked_in al pasar la hora → las alumnas 'asisten' a una clase cancelada y su crédito se consume. Existe PUT /api/admin/bookings/:id/cancel (12167) que devuelve crédito por reserva, pero es una por una y tampoco notifica (solo triggerWalletPassSync, 12219). El clie |
| C6 | 🟡 | ✅ | backend/server/index.js:13776 PUT /api/admin/classes/:id — detecta instructorChanged (13795) y notifica async a todas las reservadas confirmed/checked_in por email (sendCustomBroadcast, 13853) y WhatsApp (template 'instructor_changed', 13865) con plantillas editables desde Settings (13833) y flag notifyAttendees (13780); UI en frontend/src/pages/admin/classes/ClassesCalendar.tsx:755 y 1181-1223 ('Las alumnas reservadas serán notificadas automáticamente por email y WhatsApp'). Nota menor: no incluye a las de waitlist en la notificación. |
| C7 | 🟠 | ❌ | backend/server/index.js:13776 PUT /api/admin/classes/:id acepta startTime/endTime (13779, 13802-13803) pero la notificación SOLO se dispara si cambió la instructora (condición instructorChanged en 13815); un cambio de horario no notifica a nadie ni ofrece cancelación sin penalización. La UI admin ni siquiera expone edición de horario (ClassesCalendar.tsx:755 solo envía { instructorId, notifyAttendees }), y el UPDATE no acepta cambio de fecha. |
| C8 | ⚪ | ❌ | frontend/src/pages/client/MyBookings.tsx:79 — canCancel exige booking.status === 'confirmed', así que el botón Cancelar NO aparece para reservas en 'waitlist' (Dashboard.tsx:252-257 solo muestra el badge 'Espera' sin acción). El backend DELETE /api/bookings/:id sí procesaría una waitlist, pero le aplica la misma ventana min_hours (index.js:3698 — en las últimas horas ni siquiera podría salirse) y la salida contaría contra su cupo de cancelaciones gratis (getCancellationQuota cuenta todo cancelled_by='user' sin distinguir waitlist, index.js:9439-9446). La página admin Waitlist.tsx (frontend/src/pages/admin/bookings/Waitlist.tsx) es solo lectura, sin acciones de quitar/promover. |

### Gaps de C — qué pasa hoy / qué debería pasar

**C1 ⚠️ 🔴**
- *Hoy:* El crédito se devuelve (solo si quedan cancelaciones gratis; default 1 por membresía) y el cupo se libera, pero las alumnas en lista de espera siguen con status 'waitlist' sin enterarse; el lugar lo gana quien entre a mirar el calendario por casualidad.
- *Debería:* Al liberar un lugar en clase con waitlist, promover automáticamente a la primera de la lista (o notificarla con ventana para confirmar) y pasar a la siguiente si no responde, disparando B5.
- *Dónde vive el fix:* DELETE /api/bookings/:id (backend/server/index.js ~3726-3764) + nueva función de promoción/notificación de waitlist

**C3 ⚠️ 🟠**
- *Hoy:* Si recepción no marca el no-show antes de que corra el cron (~10 min después de terminar la clase), la falta queda registrada como asistencia ('checked_in' con checkin_method='auto'). El crédito sí queda consumido (se descontó al reservar), pero el historial de asistencia miente y no alimenta ninguna política de no-shows repetidos (B11).
- *Debería:* Al cierre de la clase, marcar automáticamente no_show a las confirmadas sin check-in real, aplicar la política de crédito configurada y alimentar un contador de no-shows para B11.
- *Dónde vive el fix:* cron runAutoCheckin (backend/server/index.js ~14947) / nuevo cron de cierre de clase

**C4 ❌ 🟡**
- *Hoy:* Para cambiarse de horario la clienta debe cancelar y volver a reservar: la cancelación le consume una de sus cancelaciones gratis (default 1 por membresía, index.js:260) y si ya no le quedan pierde el crédito aunque solo quería moverse; además el flujo no es atómico (puede quedarse sin lugar en la clase destino después de haber cancelado la original).
- *Debería:* Flujo único cancelar+reservar en una transacción: valida cupo destino antes de soltar el origen, no consume cupo de cancelaciones gratis y nunca deja el crédito en el limbo.
- *Dónde vive el fix:* nuevo endpoint tipo POST /api/bookings/:id/reschedule + botón 'Cambiar de clase' en frontend/src/pages/client/MyBookings.tsx

**C5 ❌ 🔴**
- *Hoy:* Cancelar la clase solo la pinta de 'cancelada' en el calendario admin y bloquea nuevas reservas (index.js:3407); las reservadas no reciben ningún aviso, no recuperan su crédito automáticamente y el auto-checkin se los consume como si hubieran asistido.
- *Debería:* Cancelación masiva transaccional: cancelar todas las bookings de la clase, devolver créditos sin consumir cupo de cancelaciones gratis, excluirlas del auto-checkin, notificar por WhatsApp/email y sugerir horarios alternativos.
- *Dónde vive el fix:* PUT /api/classes/:id/cancel (backend/server/index.js:8663) + notificación a reservadas

**C7 ❌ 🟠**
- *Hoy:* Si el estudio mueve el horario (vía API directa o recreando la clase), las reservadas quedan pegadas al nuevo horario sin aviso; si ya no les acomoda, cancelar les consume su cupo de cancelaciones gratis o el crédito completo.
- *Debería:* Detectar cambio de start_time/fecha, notificar a las reservadas por WhatsApp/email y darles la opción de conservar la reserva o cancelar con devolución de crédito sin contar contra su cupo.
- *Dónde vive el fix:* PUT /api/admin/classes/:id (backend/server/index.js:13776) + edición de horario en ClassesCalendar.tsx

**C8 ❌ ⚪**
- *Hoy:* La clienta en lista de espera no tiene forma de salirse sola: debe contactar al estudio para que un admin cancele su entrada.
- *Debería:* Botón 'Salir de la lista de espera' siempre disponible para bookings 'waitlist', sin ventana de cancelación ni consumo de cancelaciones gratis (la waitlist no ocupa lugar ni consumió crédito al crearse).
- *Dónde vive el fix:* frontend/src/pages/client/MyBookings.tsx BookingCard (~línea 79) + DELETE /api/bookings/:id (backend/server/index.js:3628)


## D — Paquetes y membresías  ·  cobertura 54% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| D1 | 🟠 | ✅ | backend/server/index.js:3082 GET /api/plans (público, devuelve plans activos con price, class_limit, duration_days, features, class_category, discount_price); schema plans con columnas duration_days/class_limit/discount_price (index.js:805-816) y seed de planes reales (index.js:894-901: 'Clase de prueba' $120/7d/1, 'Paquete 4 clases' $500/30d/4, 'Membresía mensual' $990/30d/12, 'Plan ilimitado 6 meses' $16000/180d). Frontend: frontend/src/pages/client/Checkout.tsx:73-146 renderiza precio, '{durationDays} días', '{classLimit} clases', features y precio con descuento tarjeta/transferencia; landing tiene PlansTeaser.tsx. Restricciones tipo 'solo mat' viven en plans.class_category (los planes ac |
| D2 ✔︎ver | 🔴 | ⚠️ | backend/server/index.js:4588 POST /api/orders (crea orden con precio, código de descuento, dedupe de órdenes pendientes) → 4776 mpCreatePreference (Checkout Pro) → 4386 POST /webhooks/mercadopago con verificación HMAC (4162 mpVerifyWebhookSignature) e idempotencia por payment_webhook_events (4406-4417) → 4188 approveOrderFromMP: transacción que aprueba la orden, INSERTA membresía activa con classes_remaining y end_date (4248-4252), registra pago en payments (4300-4304) y manda email+WhatsApp de membresía activada (4331-4348). Cero intervención humana en el flujo de tarjeta. \|\| VERIFICADOR: El happy path SÍ está bien construido y las citas del auditor son correctas: backend/server/index.js: |
| D3 ✔︎ver | 🔴 | ✅ | backend/server/index.js:3129 GET /api/memberships/my devuelve classes_remaining, end_date, class_limit, plan_name; frontend/src/components/MembershipCard.tsx:285-383 muestra número grande de clases restantes, barra de progreso 'X de Y usadas', 'Vence el d de MMMM yyyy' y días restantes; Apple Wallet pass muestra 'Clases restantes X / Y' (index.js:7297) y strip con sellos según remaining (index.js:6693, 7113); el recordatorio de renovación por WhatsApp incluye classesRemaining (index.js:15167). Nota: con dos membresías activas GET /my LIMIT 1 solo muestra la que vence antes (ver D6). |
| D4 | 🟠 | ⚠️ | backend/server/index.js:15125 runRenewalReminderCron corre diario 9:00 AM MX (15441-15444), manda email sendRenewalReminder con CTA 'Renovar membresía' → /app/checkout (emailService.js ~363-380) + WhatsApp template renewal_reminder (15160-15172). Cojea: la condición (15139-15146) solo dispara con classes_remaining = 1 exacto, o para ilimitadas (classes_remaining IS NULL) con end_date ≤ 7 días. |
| D5 | 🟠 | ⚠️ | backend/server/index.js:15388 reconcileExpiredMemberships (cron cada 60 min, 15421-15424) marca 'expired' las membresías vencidas por fecha (end_date < hoy MX) o sin créditos y sin reservas futuras; política efectiva = las clases se pierden al vencer. syncExhaustedMembershipStatus (2184) revierte a active si recuperan créditos. Cojea: política hardcodeada y sin comunicación al expirar. |
| D6 | 🟠 | ⚠️ | frontend/src/pages/client/Dashboard.tsx:265-279 CTA 'Renueva tu plan' con clases restantes cuando isLowCredits → /app/checkout (pocos taps); email de renovación con CTA al checkout (emailService.js ~379). Política de inicio: el nuevo paquete SIEMPRE inicia el día de aprobación del pago (approveOrderFromMP index.js:4237-4238 todayStr), determinista; y selectMembershipForClass (2258-2305) consume primero la que vence antes, protegiendo los créditos viejos. Cojea: sin stacking y la app oculta el paquete nuevo. |
| D7 | 🟡 | ❌ | grep -in 'freeze\|congel\|pausa' en backend/server/index.js solo devuelve Object.freeze (89, 253). Único rastro: PUT /api/memberships/:id acepta status 'paused' en su validación (index.js:11535) y algunos reportes lo cuentan como pagada (13089), pero el admin UI ni lo ofrece (frontend/src/pages/admin/memberships/MembershipsList.tsx:25 STATUS_OPTIONS = active/pending_payment/pending_activation/expired/cancelled). |
| D8 ✔︎ver | 🔴 | ⚠️ | backend/server/index.js:12457 POST /api/admin/clients/manual — crea clienta (upsert por email, teléfono, contacto de emergencia), asigna plan, fecha de inicio EDITABLE y retroactiva (12506 startDate → 12507 calcMembershipEndDate), payment_method, activa 'active' y notifica email+WhatsApp (12554-12584); además vincula compras previas walk-in por teléfono (12532-12547). Para clienta existente: POST /api/memberships (10931) con startDate (10958), auto-cancela carritos pending_payment (10944-10953). Frontend: MembershipsList.tsx:381 'Fecha de inicio' con DatePicker. La verificación de comprobantes (PUT /api/admin/orders/:id/verify, 12669) también activa membresía ligada a la orden. Cojea: sin mo |
| D9 | 🟠 | ✅ | backend/server/index.js:2258-2309 selectMembershipForClass — regla explícita, determinista y documentada en comentario: la membresía debe cubrir LA FECHA DE LA CLASE (end_date >= classDate, 2284), con créditos >0 o ilimitada (2289-2293), y el ORDER BY prefiere categoría específica > mixto > all (2295-2300), luego LA QUE VENCE ANTES (end_date ASC, 2301-2302), ilimitadas al final (2303) y created_at ASC como desempate (2304). Se usa en la reserva de clienta (3422) y en la reserva hecha por admin (11935). El comentario 2260-2264 documenta justo el caso de renovación con 2 membresías activas. |
| D10 | ⚪ | ❌ | grep -in 'gift\|regala\|tarjeta de regalo' en backend/server/index.js y frontend/src: sin resultados de gift card canjeable (solo CourtesyButton.tsx, que es cortesía otorgada por admin, no regalo entre clientas). Los términos declaran 'uso personal e intransferible de tus clases y membresías' (index.js:204) y existe plans.is_non_transferable (index.js:813), es decir la NO transferencia de créditos es política deliberada. |
| D11 | 🟡 | ✅ | backend/server/index.js:558-570 CREATE TABLE discount_codes (code UNIQUE, discount_type percent/fixed, discount_value, max_uses, uses_count, expires_at, channel, class_category, is_active) + ALTERs 1357-1360 (min_order_amount, plan_id FK a plans, channel). Validación clienta: POST /api/discount-codes/validate (5164); aplicación en checkout con vigencia/límite de usos/plan/categoría/canal (findApplicableDiscountCode 2311-2360: expires_at > NOW(), uses_count < max_uses); incremento de uso al aprobar la orden (4275-4277 incrementDiscountUsage). Admin CRUD completo: GET 13115, POST 13130, PUT 13201, DELETE 13270, redemptions 13281, con página frontend/src/pages/admin/discount-codes. Precios por  |
| D12 | 🟠 | ⚠️ | Cortesía: POST /api/admin/memberships/courtesy (index.js:11040-11127, UI CourtesyButton.tsx) crea membresía gratis con N clases y registra en membership_credit_log (logCreditChange 11084, reason 'admin_courtesy_granted'). Ajuste de saldo/vigencia: PUT /api/memberships/:id (11531) edita classes_remaining/end_date y audita cambios de créditos en membership_credit_log (tabla 1287, logCreditChange 2223-2245: old/new/delta/reason/actor_user_id) con visor GET /api/memberships/:id/credit-log (11512) y página admin/audit/AuditLogPage.tsx. Cojea: el motivo NO es obligatorio y end_date no se audita. |
| D13 | ⚪ | ❌ | grep -in 'upgrade\|prorate\|prorrat' en backend/server/index.js: 0 resultados. No existe endpoint ni UI de cambio de plan a mitad de vigencia. |

### Gaps de D — qué pasa hoy / qué debería pasar

**D2 ⚠️ 🔴**
- *Hoy:* Un pago con tarjeta que MP deja en in_process y aprueba después (pending_contingency), o cualquier fallo transitorio al procesar el primer webhook, deja la orden pagada atascada en pending_payment: los reintentos de MP mueren en el dedupe (23505 → return en 4414), no hay cron ni endpoint de reproceso, y la clienta ve un spinner que promete activación automática que nunca llega. La única salida es que un admin apruebe manualmente vía PUT /api/admin/orders/:id/verify (12669), sin ninguna alerta que le avise.
- *Debería:* La idempotencia debe ser por evento/estado (p.ej. event_key = 'payment:<id>:<status>' o usar x-request-id) o, mejor, permitir re-procesar cuando el estado sincronizado cambió; si el procesamiento falla, borrar/omitir el registro para que los reintentos de MP sí se procesen; y agregar una red de seguridad: cron de reconciliación que re-consulte mpSyncPayment para órdenes card en pending_payment con mp_payment_id, o botón admin de 'reprocesar evento' sobre payment_webhook_events sin processed_at. Opcional: validar transaction_amount contra order.total_amount antes de aprobar y exigir MP_WEBHOOK_SECRET en producción.

**D4 ⚠️ 🟠**
- *Hoy:* Un paquete limitado que está por vencer POR FECHA con 2+ clases restantes (ej. 4 clases y vence en 3 días) nunca recibe recordatorio: no cumple classes_remaining=1 ni la rama de ilimitadas. Solo avisa en la última clase o en planes ilimitados.
- *Debería:* Recordar también por proximidad de end_date en planes limitados (ej. ≤5 días para vencer con clases sin usar), además de la regla de última clase, con dedupe para no repetir el aviso cada día.
- *Dónde vive el fix:* backend/server/index.js runRenewalReminderCron (query de 15130-15147)

**D5 ⚠️ 🟠**
- *Hoy:* Al vencer con clases sin usar el sistema silenciosamente pone status='expired'; no hay email/WhatsApp avisando 'tu paquete venció con N clases sin usar', no existe periodo de gracia ni opción de congelar, y la política 'se pierden' no está escrita en ningún texto visible para la clienta (solo 'Vence el X' en la tarjeta).
- *Debería:* Política configurable (se pierden / gracia de X días / congelables), notificación automática al expirar con clases restantes, y texto de política visible en checkout y en la tarjeta de membresía.
- *Dónde vive el fix:* backend/server/index.js reconcileExpiredMemberships (15388) + settings (tabla settings) para política configurable + emailService/WhatsApp para el aviso

**D6 ⚠️ 🟠**
- *Hoy:* No existe opción de que el paquete nuevo inicie al vencer el actual: si renueva anticipado, la vigencia del nuevo corre desde hoy (pierde días de traslape). Además GET /api/memberships/my hace LIMIT 1 (index.js:3179), así que tras renovar la clienta solo ve la membresía vieja hasta que expire; el saldo del paquete nuevo es invisible en app y wallet.
- *Debería:* Definir/ofrecer stacking (nuevo paquete inicia al vencer el anterior, o al menos comunicar 'inicia hoy') y mostrar ambas membresías activas (o el saldo combinado) en el dashboard.
- *Dónde vive el fix:* backend/server/index.js approveOrderFromMP (4235-4254) + GET /api/memberships/my (3129-3187) + Dashboard/MembershipCard

**D7 ❌ 🟡**
- *Hoy:* No hay congelamiento real: poner 'paused' a mano vía API no extiende end_date (la vigencia sigue corriendo mientras está pausada), no reactiva automáticamente, no hay límites configurables (máx X días, Y veces/año), no define qué pasa con reservas futuras, y no hay UI ni para admin ni para clienta. En la práctica la dueña tendría que editar end_date a mano.
- *Debería:* Freeze con fecha de reanudación que corra el end_date por los días congelados, bloqueo de reservas durante la pausa, límites configurables y registro de quién/por qué la pausó.
- *Dónde vive el fix:* backend/server/index.js (nuevo endpoint freeze/unfreeze sobre memberships: pausar + extender end_date) + memberships (columnas paused_at/frozen_days) + admin MembershipsList.tsx y opcionalmente self-service en client/Profile

**D8 ⚠️ 🔴**
- *Hoy:* En la activación manual directa (efectivo en mostrador sin orden previa) solo se guarda payment_method en la membresía: no se registra monto ni referencia, y no se crea fila en orders ni en payments (el único INSERT INTO payments está en el webhook MP, index.js:4301). Esa venta manual queda fuera de la contabilidad/reportes de ingresos basados en orders.
- *Debería:* El alta manual debería crear también el registro de pago (monto cobrado, método, referencia, quién lo registró) ligado a la membresía, para que la venta de mostrador aparezca en reportes igual que las ventas online.
- *Dónde vive el fix:* backend/server/index.js POST /api/admin/clients/manual (12457) y POST /api/memberships (10931) + tabla payments/orders

**D10 ❌ ⚪**
- *Hoy:* No hay forma de comprar clases para otra persona ni gift card con código; lo más cercano es que la dueña otorgue cortesías manualmente (POST /api/admin/memberships/courtesy).
- *Debería:* Opcional según el estudio (⚪): gift card con código canjeable comprable en checkout. La transferencia de créditos está deliberadamente prohibida por términos, eso está bien.
- *Dónde vive el fix:* backend/server/index.js (tabla gift_cards con código canjeable + endpoint de canje) y checkout del frontend, si el estudio lo quisiera

**D12 ⚠️ 🟠**
- *Hoy:* adjustReason es opcional (11566: 'adjustReason || null') y la UI de ajuste en ClientDetail.tsx:65-66 manda solo { classesRemaining } sin campo de motivo; la nota de cortesía también es opcional (11045). Además extender end_date (regalar vigencia) por PUT no deja ningún rastro en membership_credit_log (solo se auditan cambios de classes_remaining).
- *Debería:* Motivo obligatorio (backend 400 si falta + campo requerido en la UI) para todo ajuste manual de saldo o vigencia, y auditar también los cambios de end_date con actor y motivo.
- *Dónde vive el fix:* backend/server/index.js PUT /api/memberships/:id (11531-11576) y POST courtesy (11045) + frontend/src/pages/admin/clients/ClientDetail.tsx (diálogo de ajuste)

**D13 ❌ ⚪**
- *Hoy:* La clienta que quiere subir de paquete tiene que comprar el plan nuevo a precio completo; quedan dos membresías coexistiendo (la vieja se consume primero por selectMembershipForClass) sin prorrateo ni política comunicada. Alternativa actual: la dueña ajusta a mano créditos/vigencia vía PUT /api/memberships/:id.
- *Debería:* Opcional (⚪): política clara de upgrade — pagar diferencia prorrateada o sumar clases restantes al plan nuevo — o al menos documentar que el camino oficial es compra nueva + ajuste manual.
- *Dónde vive el fix:* backend/server/index.js (endpoint de upgrade sobre memberships/orders) + client/Checkout.tsx


## E — Pagos  ·  cobertura 33% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| E1 ✔︎ver | 🔴 | ✅ | backend/server/index.js:4091 mpCreatePreference (Checkout Pro, excluded_payment_types:[] → tarjeta y demás métodos que MP ofrezca); :4104-4108 back_urls success/failure/pending hacia /app/orders?checkout=...; :4768-4792 POST /api/orders genera checkout de tarjeta; :4937 POST /api/orders/:id/pay-with-card regenera/reutiliza checkout; :5013 POST /api/orders/:id/proof para SPEI manual con comprobante; frontend/src/pages/client/MyOrders.tsx:100-117 banners claros de success/failure/pending con auto-refresh cada 3s (:45-52). Retorno de éxito/fallo claro y tres métodos operando (card online, transfer SPEI con comprobante, cash en estudio). |
| E2 ✔︎ver | 🔴 | ⚠️ | frontend/src/pages/admin/payments/PaymentsPage.tsx:95-133 y :752 (pestaña 'Asignación manual': cliente + plan + método cash/transfer/card → POST /memberships); backend/server/index.js:10931-10970 POST /api/memberships (adminMiddleware, captura paymentMethod pero el INSERT :10963 NO guarda referencia ni activated_by); :12668-12723 PUT /api/admin/orders/:id/verify sí registra verified_by/verified_at; :13038 GET /api/payments une órdenes aprobadas + membresías manuales como pagos (alimenta ingresos, :9116). |
| E3 ✔︎ver | 🔴 | ⚠️ | backend/server/index.js:1211-1220 CREATE TABLE payment_webhook_events con UNIQUE(provider, event_key); :4405-4416 INSERT de idempotencia con eventKey `payment:<mpPaymentId>` y return en error 23505; :4213-4217 approveOrderFromMP usa SELECT FOR UPDATE + check status='approved'; :1223-1224 índice único memberships(order_id) evita doble membresía. El webhook duplicado NO produce doble activación. |
| E4 ✔︎ver | 🔴 | ❌ | mpSyncPayment (index.js:4141) solo se invoca desde handleMpPaymentNotification (:4360), que solo se llama desde el webhook (:4421). grep de mpSyncPayment/handleMpPaymentNotification confirma cero usos fuera del webhook; no existe cron ni endpoint que consulte /v1/payments/search de MP. El cron auto-revert (:15315) es solo para transferencias provisionales, no reconcilia MP. |
| E5 | 🟠 | ⚠️ | frontend/src/pages/client/MyOrders.tsx:106-110 banner claro de fallo; :57-65 y :173-177 botón 'reintentar' que llama POST /orders/:id/pay-with-card; backend/server/index.js:4956-4958 reutiliza el checkout sin duplicar preferencias; :206 muestra rejection_reason. El contexto (orden con plan y monto) se conserva. |
| E6 | 🟠 | ❌ | grep -n 'refund\|reembols' en index.js: todos los hits (3666, 3903, 12374-12432, etc.) son devolución de CRÉDITOS de clase por cancelación de reserva, no reembolsos de dinero. No existe llamada a la API de refunds de MP ni flujo de reembolso parcial. handleMpPaymentNotification (:4373-4380) no maneja status 'refunded'. |
| E7 | 🟡 | ❌ | grep -n 'chargeback\|contracargo\|charged_back\|dispute' en index.js: cero resultados. El webhook filtra eventType !== 'payment' (:4404) → las notificaciones topic 'chargebacks' de MP se descartan antes del registro; y un payment.updated con status charged_back del mismo payment_id se descarta por la clave de idempotencia ya consumida (:4415, ver E3). |
| E8 | 🟡 | ⚠️ | backend/server/index.js:4332-4347 (webhook MP), :12797-12816 (verify admin) y :10989 (asignación manual) envían sendMembershipActivated (emailService.js:214-235) + WhatsApp template membership_activated al confirmar el pago. Pero no existe sendPaymentApproved ni recibo como tal: grep 'recibo\|sendPayment' no encuentra nada más. |
| E9 | ⚪ | ❌ | grep -rn 'CFDI\|factura\|RFC\|fiscal' sobre backend/server/index.js y frontend/src: cero resultados. No existe captura de datos fiscales ni solicitud de factura en ninguna pantalla ni tabla. |
| E10 | 🟠 | ➖ | Sistema single-tenant (un solo estudio, perfil de operación): un solo MP_ACCESS_TOKEN global (index.js:40) y cero hits de application_fee/marketplace/split en el código. No aplica split payments ni OAuth por estudio al modelo de negocio. |

### Gaps de E — qué pasa hoy / qué debería pasar

**E2 ⚠️ 🔴**
- *Hoy:* El pago manual se registra con método y monto implícito (precio del plan), pero: (1) no se captura referencia/folio bancario; (2) la asignación manual no registra quién la hizo — activated_by nunca se llena y adminAuditMiddleware (index.js:2001-2033) no cubre /api/memberships porque no empieza con /api/admin/; (3) no se puede ajustar el monto real cobrado; (4) el verify manual no inserta fila en la tabla payments (solo el webhook MP lo hace, :4301)
- *Debería:* Capturar monto real, referencia y actor en la asignación manual (llenar activated_by/payment_reference o insertar en payments con processed_by), y auditar la ruta POST /api/memberships
- *Dónde vive el fix:* POST /api/memberships (index.js:10931) + PaymentsPage.tsx CashAssignment; columnas payment_reference y activated_by de memberships (schema_complete.sql:289-292) ya existen pero no se usan

**E3 ⚠️ 🔴**
- *Hoy:* La clave de idempotencia es solo `payment:<id>` sin el status: la PRIMERA notificación de un pago consume la clave, y toda notificación posterior del mismo payment_id (transición pending→approved de OXXO/SPEI/pago en revisión, o approved→refunded/charged_back) se descarta en :4415 con 23505 sin procesarse. Además los eventos que fallan quedan sin processed_at pero solo existe un viewer de solo lectura (GET /api/admin/payment-webhook-events :7704), sin endpoint de reprocesamiento
- *Debería:* Incluir el status (o un hash del evento) en event_key, o permitir reprocesar el mismo payment_id cuando el status cambió; agregar botón admin de reproceso para eventos sin processed_at
- *Dónde vive el fix:* webhook /webhooks/mercadopago (index.js:4386-4433) y event_key de payment_webhook_events

**E4 ❌ 🔴**
- *Hoy:* Si el webhook nunca llega (o llegó como 'pending' y la transición se descartó por el bug de idempotencia de E3), la orden de tarjeta queda en pending_payment para siempre; el frontend solo hace polling de /orders (MyOrders.tsx:45-52) que no consulta MP. Workarounds: la admin puede aprobar manualmente vía PUT /api/admin/orders/:id/verify (:12668) mirando el panel de MP por fuera, y ver los eventos recibidos en :7704, pero nada consulta la API de la pasarela
- *Debería:* Job periódico o botón admin que consulte MP (payments/search?external_reference=orderId) para órdenes card en pending_payment con más de N minutos, y active vía approveOrderFromMP
- *Dónde vive el fix:* Debería vivir como cron junto a scheduleAutoRevertCron (index.js:15373) o como botón en admin Pagos/orden que llame a la API de búsqueda de MP por external_reference

**E5 ⚠️ 🟠**
- *Hoy:* Cuando MP notifica un intento rechazado, :4374-4380 marca la orden completa como 'rejected' (estando en pending_payment); pay-with-card entonces responde 400 'Esta orden ya no acepta pagos' (:4953-4955) y el botón de reintento desaparece (solo se muestra con status pending_payment). Tras un solo intento fallido reportado por webhook, la clienta pierde el reintento en la app y debe crear una orden nueva; además el motivo mostrado es el status_detail crudo de MP (ej. 'cc_rejected_insufficient_amount') sin traducir
- *Debería:* No tumbar la orden a 'rejected' por un intento fallido (mantener pending_payment o permitir retry sobre rejected), y traducir status_detail a mensajes amigables
- *Dónde vive el fix:* handleMpPaymentNotification (index.js:4374-4380) + condición del botón retry en MyOrders.tsx:173

**E6 ❌ 🟠**
- *Hoy:* No hay flujo de reembolso: el único workaround es PUT /api/admin/orders/:id/reject (:12967) que cancela la membresía activa (:12983-12986) pero envía la notificación equivocada ('tu comprobante no pudo ser aprobado'), no mueve dinero, no soporta parcial ni contabiliza clases usadas vs. devueltas; y si el reembolso se hace en el panel de MP, el evento 'refunded' entrante se descarta por la idempotencia de E3 y la orden sigue 'approved'
- *Debería:* Flujo de reembolso total/parcial que llame a MP, registre monto devuelto y actor, revierta/ajuste la membresía según clases usadas, y quede auditado
- *Dónde vive el fix:* Debería vivir como acción admin en Pagos/órdenes (nuevo endpoint POST /api/admin/orders/:id/refund) que llame a POST /v1/payments/:id/refunds de MP y revierta la membresía

**E7 ❌ 🟡**
- *Hoy:* Un contracargo no se registra, no congela la membresía asociada y no alerta a nadie: la clienta sigue tomando clases con un pago disputado
- *Debería:* Aceptar/registrar eventos de chargeback (topic chargebacks o status charged_back/in_mediation), pausar la membresía ligada a la orden y notificar a la dueña
- *Dónde vive el fix:* webhook /webhooks/mercadopago (index.js:4386) + handleMpPaymentNotification (:4359); congelación en memberships.status + alerta vía sendConfiguredWhatsAppTemplate/email a la dueña

**E8 ⚠️ 🟡**
- *Hoy:* La confirmación enviada es de 'membresía activada' (plan, clases, vigencia) sin monto pagado, método, referencia ni folio de orden — no sirve como comprobante de pago; y las ventas POS (:2481-2595) y compras sin plan no envían nada
- *Debería:* Recibo automático (email/WhatsApp) con folio, monto, método y fecha para todo pago confirmado, incluyendo POS y eventos
- *Dónde vive el fix:* emailService.js (nueva plantilla de recibo) + los tres puntos de aprobación (index.js:4332, :12797, :10989) y processPosSale (:2481)

**E9 ❌ ⚪**
- *Hoy:* Una clienta que necesita CFDI no tiene dónde pedirlo ni dejar sus datos fiscales; todo se maneja fuera del sistema
- *Debería:* Formulario para capturar RFC/datos fiscales ligado a una orden aprobada + notificación a la dueña; la emisión puede seguir siendo externa
- *Dónde vive el fix:* Perfil de la clienta (frontend/src/pages/client) + tabla nueva (ej. invoice_requests con RFC, razón social, uso CFDI, order_id) + aviso a la dueña vía WhatsApp admin


## F — Check-in y asistencia  ·  cobertura 50% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| F1 ✔︎ver | 🔴 | ❌ | backend/server/index.js:12106 — el único check-in de CLASES es PUT /api/bookings/:id/check-in (botón manual admin, sin QR). El único endpoint de escaneo es para EVENTOS: POST /api/events/:eventId/checkin/scan (index.js:14731) y no tiene UI (grep -ri 'scan\|html5-qrcode\|getUserMedia\|BarcodeDetector' en frontend/src = 0 hits de escáner; qrcode.react está en package.json pero sin uso en src). El QR del wallet pass de membresía codifica base64(userId) (index.js:6369) y ningún endpoint lo resuelve para clases. La tabla checkin_logs con qr_code_used existe en backend/supabase/migrations/schema_complete.sql:1088-1094 pero index.js nunca la escribe (grep 'checkin_logs' en index.js = 0). BookingsLi |
| F2 ✔︎ver | 🔴 | ⚠️ | backend/server/index.js:12106-12133 — PUT /api/bookings/:id/check-in existe con botón por alumna en frontend/src/pages/admin/bookings/BookingsList.tsx:379-383, sobre el roster con nombre/teléfono/plan/saldo (GET /api/classes/:id/roster, index.js:12228-12246). PERO el UPDATE (index.js:12109) no aplica ninguna validación: no exige status previo 'confirmed', no verifica vigencia/saldo y no fija checkin_method. |
| F3 ✔︎ver | 🔴 | ⚠️ | backend/server/index.js:3455-3456 (lock FOR UPDATE de la membresía) + 3533-3548 (descuento de classes_remaining al RESERVAR con logCreditChange a membership_credit_log, tabla en 1286-1300); paquete correcto elegido por categoría y fecha vía selectMembershipForClass (3420-3427); triggers legacy que causaban doble descuento eliminados explícitamente (1281-1284, comentario 1277-1279); el cron auto-checkin NO toca crédito (comentario 14943-14945) y el check-in admin tampoco (12106-12133). Política = descontar al reservar, aplicada consistentemente. |
| F4 | 🟠 | ✅ | backend/server/index.js:12268-12316 — POST /api/admin/classes/:id/walkin en una transacción: lock de cupo FOR UPDATE (12277), rechaza clase llena (12280), crea orden 'approved' channel='walkin' con plan/método de pago/monto (12290-12297) + booking guest confirmado sin user_id (12300-12304). UI 'Bloquear lugar — Walk-in' en frontend/src/pages/admin/classes/ClassesCalendar.tsx:313-364 (nombre, teléfono, plan, cash/transfer, monto). Histórico de invitadas por teléfono: GET /api/admin/walkins/by-phone (12319). Si es clienta existente con saldo: POST /api/admin/bookings/assign (11901-12009) descuenta del paquete correcto con validaciones completas. Alta exprés con cuenta+membresía en un paso: POS |
| F5 | 🟡 | ❌ | grep -n 'tolerancia\|tolerance\|grace\|late_' en backend/server/index.js solo devuelve late_cancel_message (index.js:263), que es la ventana de CANCELACIÓN, no de llegada. El cron runAutoCheckin (index.js:14947-14963) marca TODAS las confirmadas como checked_in al terminar la clase, sin distinguir retraso ni ausencia. Las columnas is_late/minutes_early_late existen solo en el schema aspiracional (backend/supabase/migrations/schema_complete.sql:1108-1109) y index.js nunca las escribe. Marcar no_show es 100% manual (index.js:12136 y 12376). |
| F6 | 🟠 | ➖ | N/A por perfil de operación: el estudio no trabaja con agregadores (TotalPass/Wellhub/Fitpass). Verificado: grep -ri 'totalpass\|wellhub\|fitpass\|gympass' en backend/ y frontend/src = 0 resultados; no hay canal externo que conciliar. |
| F7 | 🟡 | ⚠️ | La mitad 'captura posterior sin duplicar descuentos' está resuelta por diseño: el crédito se descuenta al reservar (index.js:3533-3548), el check-in retroactivo (12106) no toca crédito, y runAutoCheckin es idempotente (solo status='confirmed', 14959) con catch-up al arrancar y cada 10 min (15304-15311). Lo que FALTA es el fallback en sí: grep -ri 'imprimir\|print\|offline' en frontend/src/pages/admin = 0 hits; no hay lista imprimible del día, ni export, ni service worker/caché offline. |
| F8 ✔︎ver | 🔴 | ⚠️ | EVENTOS sí es idempotente: performEventCheckin (index.js:14279-14281) devuelve alreadyCheckedIn sin re-ejecutar efectos y responde 'La clienta ya tenía check-in registrado' (14754). CLASES no: PUT /api/bookings/:id/check-in (index.js:12108-12111) hace UPDATE sin condición de estado previo, y cada llamada repetida vuelve a insertar puntos de lealtad (12121-12124: INSERT loyalty_transactions 'Clase asistida') y re-dispara wallet sync (12128). No hay doble descuento de clase (el crédito se descontó al reservar) y la UI oculta el botón tras check-in (BookingsList.tsx:273), pero la API queda desprotegida. |
| F9 | 🟡 | ✅ | backend/server/index.js:12228-12260 — GET /api/classes/:id/roster devuelve por alumna status (confirmed vs checked_in), checked_in_at y checkin_method, ordenado confirmed→checked_in→waitlist→no_show. UI: frontend/src/pages/admin/bookings/BookingsList.tsx:247 muestra contador 'Asistieron' y badge 'Asistió ✓' por persona (línea 49). El rol instructora tiene acceso: adminMiddleware acepta 'instructor' (index.js:2834) y AuthGuard ADMIN_ROLES incluye 'instructor' (frontend/src/components/admin/AuthGuard.tsx:5). Nota: es la vista admin compartida (sin filtro 'solo mis clases' — eso es dominio J/I7) y se actualiza por refetch, no en tiempo real push. |

### Gaps de F — qué pasa hoy / qué debería pasar

**F1 ❌ 🔴**
- *Hoy:* El QR del wallet pass no sirve para entrar a clase: no hay escáner ni endpoint que lo resuelva contra la reserva del día. El check-in de clases es 100% manual (botón por reserva en admin) o automático post-clase vía cron.
- *Debería:* Escanear el QR (base64 userId del pass) → resolver clienta → localizar su reserva confirmada de la clase en curso → validar identidad+reserva+vigencia → marcar checked_in con checkin_method='qr_scan' en <2 segundos.
- *Dónde vive el fix:* Nuevo POST /api/checkin/scan (o /api/classes/:id/checkin/scan) en backend/server/index.js + pantalla de escáner con cámara en frontend/src/pages/admin; registrar en checkin_logs con checkin_method='qr_scan'.

**F2 ⚠️ 🔴**
- *Hoy:* Recepción puede hacer check-in manual por nombre desde el roster de la clase (cupo 7, suficiente), pero SIN 'las mismas validaciones': la UI permite check-in directo desde waitlist (BookingsList.tsx:273 canCheckin = confirmed || waitlist) y el endpoint lo acepta sin descontar crédito ni subir current_bookings; checkin_method queda NULL aunque la UI espera 'manual_reception' (BookingsList.tsx:283).
- *Debería:* El endpoint debe validar status previo (WHERE status='confirmed'), promover explícitamente si venía de waitlist (descontando crédito y cupo), registrar checkin_method='manual_reception' y checked_in_by.
- *Dónde vive el fix:* PUT /api/bookings/:id/check-in en backend/server/index.js:12106 + BookingsList.tsx:273.

**F3 ⚠️ 🔴**
- *Hoy:* En el flujo normal el descuento ocurre exactamente 1 vez (al reservar) y queda auditado. Cojea en dos puntos: (1) una reserva en waitlist nunca descuenta (index.js:3528 solo descuenta si !isWaitlist) y el admin puede marcarle check-in directo → asistencia consumida con CERO descuento; (2) la política 'al reservar vs al asistir' está hardcodeada, no es configurable.
- *Debería:* Check-in de una reserva waitlist debe promoverla primero (descontar crédito + cupo dentro de transacción) o rechazarse; idealmente la política de momento de descuento sería configurable en settings.
- *Dónde vive el fix:* PUT /api/bookings/:id/check-in (index.js:12106) y flujo de promoción de waitlist.

**F5 ❌ 🟡**
- *Hoy:* No existe política de tolerancia: una alumna que llega 20 min tarde (o que nunca llegó) queda registrada como 'asistió' por el auto-checkin, salvo que recepción la marque no_show a mano; el lugar nunca se libera por retraso.
- *Debería:* Tolerancia configurable de X minutos; pasada la ventana, poder liberar el lugar (waitlist) y/o marcar no_show de forma consistente, no depender de memoria de recepción.
- *Dónde vive el fix:* settings (nueva key p.ej. late_arrival_tolerance_min en la tabla settings) + lógica en el roster/auto-checkin de backend/server/index.js.

**F7 ⚠️ 🟡**
- *Hoy:* Si se cae el internet o la luz, recepción no tiene ninguna lista de quién viene hoy; la recuperación posterior sí es segura (marcar asistencias después no duplica descuentos).
- *Debería:* Vista/PDF imprimible del roster del día (o caché local) para operar en papel durante el corte y capturar después.
- *Dónde vive el fix:* frontend/src/pages/admin/bookings/BookingsList.tsx o el Dashboard admin (botón 'imprimir/exportar lista del día' sobre GET /api/classes/:id/roster).

**F8 ⚠️ 🔴**
- *Hoy:* Un segundo check-in de clase (doble clic, retry de red, llamada directa) duplica puntos de lealtad silenciosamente y no responde 'ya hiciste check-in'.
- *Debería:* UPDATE ... WHERE id=$1 AND status='confirmed' RETURNING; si 0 filas y ya estaba checked_in, responder 200 con 'ya tenía check-in' sin insertar lealtad ni re-sync.
- *Dónde vive el fix:* PUT /api/bookings/:id/check-in en backend/server/index.js:12106.


## G — Wallet passes  ·  cobertura 57% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| G1 | 🟠 | ⚠️ | backend/server/index.js:11029,11173 (triggerWalletPassSync 'membership_created'/'membership_activated'), :4351 (mp_payment_approved), :12839 (order_verified), :15121 (transfer_auto_approved) — el objeto de Google Wallet se crea/actualiza server-side (syncGoogleWalletObjectForUser :6394-6427) y el pase de evento se emite en ensureEventPassForRegistration (:2393, llamado en :14571). PERO la entrega del link NO existe: la plantilla WhatsApp membership_activated (:223-226) no incluye link de descarga, emailService.js no menciona wallet, y grep de frontend/src solo encuentra 'wallet' en pages/admin/settings/SettingsPage.tsx (logs admin); Checkout.tsx y EventBooking.tsx no muestran ningún botón de |
| G2 | 🟠 | ⚠️ | Apple: generateApplePkpass (backend/server/index.js:6610-7240) con QR, plan, vigencia, clases restantes, próxima clase, colores y strips de sellos; endpoint GET /api/wallet/apple/pkpass (:7245). Google: buildGoogleWalletSaveUrl (:5569-5831) con la misma info y clase con logo/hero (:5495-5542, GW_HEX_BG '#260910' :5370). PERO (a) findAssetDir/findAssetFile (:6113-6147) buscan imágenes en backend/public, backend/dist, root/public, root/dist — ninguno existe en el repo (verificado); los 431 archivos wallet-*.png viven en frontend/public / frontend/dist, así que el .pkpass se genera SIN icon.png/logo.png/strip.png (icon.png es obligatorio para Apple Wallet; sin él iOS rechaza el pase y se pierde |
| G3 | 🟠 | ✅ | backend/server/index.js: triggerWalletPassSync con debounce 1.5s (:6549-6566) llamado en ~25 puntos: reserva (:3603), cancelación (:3806), check-in (:12128), no-show (:12159), membresía creada/activada/cancelada/editada (:11029,:11173,:11188,:11570), pagos aprobados (:4351,:12839,:15121), loyalty (:5356,:13430). Apple: touch de serial + push APNs (notifyApplePassUpdatedForUser :6434-6501) y re-generación con snapshot fresco en GET /api/wallet/v1/passes/:passTypeId/:serial (:7636-7668, saldo/próxima clase/vigencia desde getWalletSnapshotForUser :6247-6374). Google: PUT loyaltyObject (:6413-6418). changeMessage 'Clases restantes: %@' (:6791) y log persistente en wallet_notification_logs (:6519 |
| G4 | 🟡 | ⚠️ | APNs implementado: registro de dispositivos POST /api/wallet/v1/devices/... (:7573-7592), push http/2 con provider token (sendApplePassUpdatedPush, finish handler :6230-6245; envío :6477-6482), prune de tokens muertos (:6486-6493); Google se actualiza vía PUT (:6413). Los changeMessage (:6791 clases, :6988 puntos) generan alerta en pantalla de bloqueo cuando cambian valores. PERO los crons de novedades NO disparan el pase: runRenewalReminderCron (:15125-15178) y runClassReminderCron (:15191+) solo mandan email/WhatsApp, sin triggerWalletPassSync; y el relevantDate del pase de membresía es now+365 días (:6640), inútil para relevancia en lock screen. |
| G5 | 🟡 | ⚠️ | Los endpoints de re-descarga existen y son idempotentes bajo login: GET /api/wallet/apple/pkpass (backend/server/index.js:7245) y GET /api/wallet/google/save-url (:5836) regeneran el pase completo en cada llamada. PERO no hay ningún camino para la clienta: grep de frontend/src no encuentra referencia alguna a esos endpoints ni componente de wallet; no existe ruta /app/wallet (App.tsx:96-106) — y el propio pase de Google enlaza a ${SITE_URL}/app/wallet (:5806) que cae en NotFound; el webhook entrante de WhatsApp es un stub con TODO (:9609-9620), no responde con el link. |
| G6 | 🟡 | ⚠️ | Al regenerar el pase, el snapshot excluye membresías vencidas (backend/server/index.js:6268 'end_date >= CURRENT_DATE') y muestra 'Sin membresía activa' (:6805, :6863; Google :5658). PERO el cron reconcileExpiredMemberships (:15388-15419, cada 60 min :15423) marca status='expired' SIN llamar triggerWalletPassSync: no hay push APNs ni PUT a Google al vencer, así que el pase instalado sigue mostrando el saldo y la vigencia viejos hasta que otro evento (reserva, pago) dispare un sync. Además no hay estado visual 'vencido' ni CTA de renovar (solo 'Sin membresía activa') y el objeto de Google queda siempre state:'ACTIVE' (:5788). |
| G7 | 🟡 | ⚠️ | Existe un web pass HTML con QR (backend/server/index.js:7290-7369) que usa el mismo qrCode base64(userId), y el escáner acepta ese token: extractUserIdFromToken decodifica base64→UUID (:14203-14209) y resuelve 'wallet_user_qr' (:14245-14258) — misma validez que el pkpass. También GET /api/wallet/pass (:5207-5291) devuelve qr_code JSON listo para una pantalla web. PERO el HTML fallback solo se sirve cuando el SERVIDOR no tiene certificados Apple (condición :7252/:7281), no cuando el dispositivo de la clienta no soporta wallet; y no existe ninguna pantalla en frontend/src que muestre el QR de la clienta (cero referencias a /api/wallet/pass, sin ruta /app/wallet). |

### Gaps de G — qué pasa hoy / qué debería pasar

**G1 ⚠️ 🟠**
- *Hoy:* Al activarse el paquete el backend sincroniza el pase en silencio, pero la clienta nunca recibe link de descarga: ni en la pantalla de éxito, ni por WhatsApp, ni por email. El objeto de Google se crea en la API pero nadie puede agregarlo a su teléfono porque el save-url jamás se le entrega.
- *Debería:* Al activar paquete/membresía, mostrar en la pantalla de éxito los botones de Apple/Google Wallet y mandar el link por WhatsApp junto con la confirmación de activación.
- *Dónde vive el fix:* Pantalla de éxito de Checkout.tsx / EventBooking.tsx (botones 'Agregar a Apple Wallet' / 'Guardar en Google Wallet' contra GET /api/wallet/apple/pkpass y /api/wallet/google/save-url) + plantilla WhatsApp membership_activated con el link

**G2 ⚠️ 🟠**
- *Hoy:* Ambos formatos están implementados en backend con la misma información, pero el pkpass de Apple se arma sin ningún asset de imagen (la búsqueda apunta a directorios inexistentes) y no existe pantalla para que la clienta obtenga cualquiera de los dos pases.
- *Debería:* El generador de pkpass debe resolver los assets desde frontend/dist (donde realmente están) para que el pase lleve icono/logo/strip de marca y sea aceptado por iOS, y el frontend debe ofrecer ambos botones según plataforma.
- *Dónde vive el fix:* backend/server/index.js findAssetDir/findAssetFile (:6113-6147) — agregar frontend/dist y frontend/public a los candidatos (igual que hace el SPA en :14877) + UI de descarga en el frontend

**G4 ⚠️ 🟡**
- *Hoy:* El push al pase solo ocurre cuando cambia un dato transaccional (reserva, saldo, pago). Los recordatorios y el 'por vencer' viajan solo por WhatsApp/email; el pase no se refresca ni aparece en pantalla de bloqueo en esos momentos.
- *Debería:* Los crons de recordatorio/renovación deben disparar también la actualización del pase (APNs/Google) y el pase de membresía debería usar relevantDate de la próxima clase para aparecer en lock screen.
- *Dónde vive el fix:* backend/server/index.js runRenewalReminderCron (:15149-15174) y runClassReminderCron — añadir triggerWalletPassSync(userId, 'renewal_reminder'/'class_reminder'); pass.json (:7015) — relevantDate de la próxima clase reservada

**G5 ⚠️ 🟡**
- *Hoy:* Si la clienta borra el pase, no tiene botón en su perfil ni comando de WhatsApp para recuperarlo; la única vía sería que alguien le pase la URL cruda del API autenticada.
- *Debería:* Botón 'Volver a descargar mi pase' en el perfil (detectando iOS/Android) y respuesta automática por WhatsApp con el link, sin fricción.
- *Dónde vive el fix:* frontend/src: nueva página /app/wallet (o sección en Profile.tsx) con botones de re-descarga; backend /api/webhook/evolution (:9610) para responder 'pase' con el link

**G6 ⚠️ 🟡**
- *Hoy:* Cuando el paquete vence por fecha, el pase en el teléfono queda congelado con clases y vigencia viejas (exactamente el 'pass desactualizado' que la matriz señala como peor que no tener pass); solo se corrige si ocurre otra transacción.
- *Debería:* Al expirar (cron), empujar la actualización a Apple/Google para que el pase muestre estado vencido con CTA de renovación inmediatamente.
- *Dónde vive el fix:* backend/server/index.js reconcileExpiredMemberships (:15392-15412) — RETURNING m.user_id y triggerWalletPassSync(userId, 'membership_expired') por cada fila; buildGoogleWalletSaveUrl/generateApplePkpass — estado 'Vencida · Renueva en varre24…' con CTA

**G7 ⚠️ 🟡**
- *Hoy:* El fallback QR web está implementado y el escáner lo valida igual que el pase nativo, pero es inalcanzable para una clienta cuyo teléfono no soporta wallet: se activa por configuración del servidor, no por elección/capacidad del dispositivo, y la app no muestra el QR en ninguna pantalla.
- *Debería:* Cualquier clienta debe poder ver su QR en la web app (misma validez en el escáner) aunque su dispositivo no tenga Apple/Google Wallet.
- *Dónde vive el fix:* frontend/src: pantalla 'Mi pase' (/app/wallet) que consuma GET /api/wallet/pass y muestre el QR como fallback universal, con el web pass HTML accesible por parámetro (?web=1) en vez de solo por ausencia de certs


## H — Notificaciones y comunicación  ·  cobertura 45% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| H1 | 🟠 | ✅ | backend/server/index.js:3573-3596 — POST /api/bookings envía tras COMMIT sendBookingConfirmed (email) + sendConfiguredWhatsAppTemplate('booking_confirmed') inmediatos; emailService.js:240-283 incluye infoRow Clase/Fecha/Hora/Instructora/clases restantes; reservas creadas por admin también notifican (index.js:12062-12082). Cama = N/A (mat sin camas numeradas). Nota menor: el template WhatsApp default (index.js:215-218) no incluye instructora, pero el email sí. |
| H2 | 🟠 | ⚠️ | backend/server/index.js:15191-15301 runClassReminderCron (dedup en whatsapp_reminders_sent 15239-15244, respeta receive_reminders 15228); scheduler 15447-15459: 9PM MX recuerda clases AM de mañana y 8AM MX las PM de hoy; template class_reminder index.js:231-234. |
| H3 ✔︎ver | 🔴 | ❌ | backend/server/index.js:8663-8669 — PUT /api/classes/:id/cancel solo ejecuta UPDATE classes SET status='cancelled': cero devolución de créditos y cero notificación; el frontend admin usa exactamente ese endpoint (frontend/src/pages/admin/classes/ClassesCalendar.tsx:681). El cancel por-reserva PUT /api/admin/bookings/:id/cancel (index.js:12167-12224) sí devuelve crédito pero tampoco envía email/WhatsApp (solo triggerWalletPassSync en 12220). |
| H4 | 🟠 | ❌ | backend/server/index.js:3520-3521 crea bookings con status='waitlist' y el email promete "Te notificaremos si se libera un lugar" (emailService.js:253-255), pero al cancelar solo se decrementa current_bookings (index.js:3729-3734, comentario "el cupo queda libre para waitlist"); grep de promoción waitlist→confirmed y de notificación de lugar liberado sin resultados en todo index.js; la página admin Waitlist.tsx es solo un roster de lectura. |
| H5 | 🟠 | ✅ | backend/server/index.js:15125-15178 runRenewalReminderCron (1 clase restante o vence en ≤7 días) ejecutado diario 9AM MX (15442-15445); email sendRenewalReminder con plan, clases restantes, vencimiento y CTA 'Renovar membresía' → /app/checkout (emailService.js:353-390) + WhatsApp templateKey 'renewal_reminder' (index.js:15160-15173). Nota: sin dedup, repite el aviso cada día mientras la condición se cumpla. |
| H6 | 🟡 | ⚠️ | POST /api/auth/register (backend/server/index.js:2865-2909) no envía ningún mensaje (solo bono de lealtad, 2884-2894); el template 'welcome' está definido (index.js:243-246) pero ningún envío lo usa (grep templateKey sin 'welcome'); al activar paquete sí llega sendMembershipActivated '¡Bienvenida!' con CTA 'Reservar clases' (emailService.js:214-236, llamado en 4332, 10989, 11100, 12561, etc.). |
| H7 | ⚪ | ⚠️ | No existe detección de inactividad (grep last_visit / inactiv / win-back / re-engage sin resultados en index.js); lo más cercano es el broadcast manual con audiencia 'Sin membresía activa — Para reactivar / promoción' (frontend/src/components/admin/BroadcastDialog.tsx:25; backend resolveBroadcastAudience index.js:9865-9866). |
| H8 | ⚪ | ⚠️ | GET /api/admin/birthdays lista cumpleaños próximos (backend/server/index.js:9959-9997) y POST /api/admin/birthdays/:userId/greet envía email (sendBirthdayGreeting, emailService.js:455) + WhatsApp en un solo paso (index.js:10002-10056); además hay bono de lealtad de cumpleaños automático al login (awardBirthdayBonusIfEligible index.js:2598, llamado en login 2922). |
| H9 | 🟡 | ⚠️ | Prefs existen: columnas users.receive_reminders/receive_promotions/receive_weekly_summary (backend/server/index.js:518-520), UI de toggles (frontend/src/pages/client/ProfilePreferences.tsx:40-42) y persistencia en PUT /api/users/:id (index.js:8084-8086). receive_reminders SÍ se respeta (cron de clase 15228, cambio de instructora 13864). |
| H10 | 🟡 | ❌ | Todos los fallos de envío terminan solo en console.error (backend/server/index.js:3596, 15282, 9895, 9928); el webhook de Evolution no procesa nada: '// TODO: handle inbound messages / delivery receipts' (index.js:9610-9615); no existe tabla de log de mensajes (la única es wallet_notification_logs, index.js:1565, que es de wallet passes); los broadcasts devuelven conteos sent/failed efímeros en la respuesta HTTP (9901, 9934) sin persistir nada. |

### Gaps de H — qué pasa hoy / qué debería pasar

**H2 ⚠️ 🟠**
- *Hoy:* El recordatorio existe pero con horas hardcodeadas (8AM/9PM MX); el setting reminder_hours_before (index.js:211) se define y jamás se lee; solo WhatsApp (sin email por clase); el mensaje no trae opción de cancelar desde ahí y el webhook entrante de Evolution es un TODO (index.js:9614), así que ni respondiendo se puede cancelar.
- *Debería:* Recordatorio configurable (24h y/o 2h antes, usando reminder_hours_before o equivalente), con link/acción para cancelar la reserva desde el mensaje, y fallback por email si no hay WhatsApp.
- *Dónde vive el fix:* backend/server/index.js runClassReminderCron + scheduleEmailCrons + settings notification_settings/notification_templates

**H3 ❌ 🔴**
- *Hoy:* Si el estudio cancela una clase, las alumnas reservadas se quedan con status='confirmed' sobre una clase cancelada, sin crédito devuelto y sin ningún aviso — se enteran al llegar al estudio.
- *Debería:* Al cancelar la clase: devolver crédito a cada booking confirmado (con logCreditChange), marcar los bookings, y disparar email + WhatsApp inmediato a cada alumna con la devolución y alternativas de horario.
- *Dónde vive el fix:* backend/server/index.js PUT /api/classes/:id/cancel (~8663) + emailService/sendConfiguredWhatsAppTemplate

**H4 ❌ 🟠**
- *Hoy:* Cuando se libera un lugar nadie promueve ni avisa a la lista de espera: la alumna en waitlist se queda en ese estado indefinidamente aunque haya cupo, pese a que el email le prometió aviso.
- *Debería:* Al liberarse un cupo, tomar al primer booking en waitlist, notificarle por WhatsApp/email con ventana de confirmación explícita (ej. 30 min) y promover o pasar al siguiente si no confirma.
- *Dónde vive el fix:* backend/server/index.js DELETE /api/bookings/:id (~3722-3734) y PUT /api/admin/bookings/:id/cancel (~12188) + tabla bookings (status waitlist)

**H6 ⚠️ 🟡**
- *Hoy:* La alumna nueva no recibe nada al registrarse; solo al activar membresía recibe un email genérico de activación que no incluye políticas clave (cancelación 4h/penalización) ni el link de su wallet pass.
- *Debería:* Email/WhatsApp de bienvenida al registrarse o al activar el primer paquete con: cómo reservar, políticas de cancelación, y link de descarga del wallet pass (el template 'welcome' ya existe, solo falta dispararlo).
- *Dónde vive el fix:* backend/server/index.js POST /api/auth/register + emailService.js (nueva sendWelcome) + flujo de activación de primer paquete

**H7 ⚠️ ⚪**
- *Hoy:* La dueña puede mandar manualmente un comunicado a quien no tiene membresía activa, pero no hay segmento por asistencia ('2-3 semanas sin venir' con membresía vigente no es detectable), ni automatización, ni control de espaciado para no repetir el mensaje.
- *Debería:* Segmento por última asistencia (checked_in_at) y envío win-back configurable y espaciado (ej. máximo 1 mensaje por ciclo), automático u ofrecido como audiencia en el broadcast.
- *Dónde vive el fix:* backend/server/index.js resolveBroadcastAudience (~9859) + un cron nuevo de inactividad

**H8 ⚠️ ⚪**
- *Hoy:* La felicitación depende de que la admin entre al panel y presione 'felicitar' ese día; si nadie lo hace, la clienta no recibe nada (el bono de puntos solo se otorga si ella inicia sesión).
- *Debería:* Cron diario que detecte cumpleaños del día y envíe la felicitación automáticamente (con el detalle opcional configurable), dejando el flujo manual como complemento.
- *Dónde vive el fix:* backend/server/index.js — nuevo cron diario que llame la lógica de greet

**H9 ⚠️ 🟡**
- *Hoy:* receive_promotions nunca se consulta en ningún envío: los broadcasts filtran por accepts_communications (index.js:9863-9864), un checkbox distinto fijado al registro, así que el toggle 'Promociones y ofertas' del perfil es cosmético; el resumen semanal ignora receive_weekly_summary y se manda a TODAS las membresías activas (14913-14922); la felicitación de cumpleaños ignora las prefs.
- *Debería:* Los envíos de marketing (broadcast, cumpleaños con promo) deben filtrar por receive_promotions/accepts_communications unificados, y el resumen semanal por receive_weekly_summary; los transaccionales (confirmación, cancelación, activación) siguen siempre — eso hoy sí se cumple.
- *Dónde vive el fix:* backend/server/index.js resolveBroadcastAudience (~9859), runWeeklyReminderCron (~14913) y greet de cumpleaños (~10002)

**H10 ❌ 🟡**
- *Hoy:* Si un número es inválido o WhatsApp no existe, el error solo aparece en los logs del servidor de Railway; el perfil de la clienta no se marca, la admin no recibe alerta y todos asumen que 'fue avisada'.
- *Debería:* Registrar cada envío y su resultado en una tabla (message_logs), procesar los delivery receipts del webhook de Evolution, marcar en el perfil los números con fallo persistente y mostrar una alerta en el panel admin.
- *Dónde vive el fix:* backend/server/index.js sendWhatsAppNow/queueWhatsAppSend (~9544-9564), sendConfiguredWhatsAppTemplate (~9589) y webhook /api/webhook/evolution (~9610) + nueva tabla message_logs + perfil de clienta y panel admin


## I — Panel admin y operación  ·  cobertura 75% 🟡

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| I1 ✔︎ver | 🔴 | ✅ | CRUD tipos de clase: backend/server/index.js:8547-8624 (GET/POST/PUT/DELETE /api/class-types) + frontend/src/pages/admin/classes/ClassTypesList.tsx:50-67. Plantilla semanal: tabla schedule_slots (index.js:606) con CRUD /api/schedules index.js:8977-9022 + WeeklySchedule.tsx:48-75. Generación desde plantilla: POST /api/classes/generate index.js:8904 + GenerateClasses.tsx:58 y duplicate-week index.js:8744 + ClassesCalendar.tsx:730. Excepciones: edición/cancelación por clase individual PUT /api/admin/classes/:id index.js:13776 (incluye cambio de instructora con notificación automática 13814-13878) y DELETE :id 13897. Instructoras: CRUD /api/instructors index.js:13491-13646 (+ foto y magic-link)  |
| I2 | 🟠 | ✅ | Dashboard.tsx:133 métrica 'Clases de hoy' (GET /api/admin/stats index.js:10720-10745) + widget 'Órdenes pendientes' Dashboard.tsx:176-205 con mismo criterio que la pestaña Pendientes de Pagos (pending_verification + cash, index.js:10741-10744). Ocupación y quién viene: ClassesCalendar.tsx marca el día actual (1014-1032), dots de ocupación por clase (1072) y roster por clase con asistentes, invitadas, check-in/no-show (GET /api/classes/:id/roster index.js:12228; ClassesCalendar.tsx:214-310). Nota menor: la vista 'hoy' está repartida entre Dashboard y Calendario, no en una sola pantalla, pero toda la información existe. |
| I3 ✔︎ver | 🔴 | ⚠️ | index.js:10760-10777 (GET /api/users busca display_name/email/phone), ClientDetail.tsx:350-531 (tabs Perfil/Membresías/Reservas/Pagos/Créditos), index.js:2856 (mapUser expone healthNotes al cliente) — no existe columna/endpoint de notas solo-staff (grep admin_notes solo aparece en orders). |
| I4 ✔︎ver | 🔴 | ✅ | Clienta existente: PaymentsPage.tsx:95-355 wizard 3 pasos (buscar cliente → elegir plan → confirmar con método cash/card/transfer) → POST /api/memberships index.js:10931 que crea la membresía 'active' con vigencia calculada, cancela carritos abandonados, manda email+WhatsApp de activación (10983-11015) y sincroniza wallet (11033). Clienta nueva: ClientsList.tsx:315-430 diálogo 'Nueva clienta' con datos + plan + método de pago en una pantalla → POST /api/admin/clients/manual index.js:12457 (crea usuario + membresía activa en una transacción). El dinero queda en historial: /api/payments index.js:13038 (PaymentsPage historial distingue origen 'Registrado por admin', PaymentsPage.tsx:643-644) y  |
| I5 | 🟠 | ⚠️ | index.js:11531-11577 (PUT /api/memberships/:id, adjustReason opcional), ClientDetail.tsx:64-73 y 159-201 (diálogo sin campo de motivo), index.js:2010-2017 (regex de auditoría sin /api/memberships). |
| I6 | 🟠 | ⚠️ | index.js:8676-8739 (force-range borra bookings sin reembolso ni notificación), index.js:8663-8669 (cancel de clase sin efectos secundarios), index.js:8826-8868 (week delete rehúsa con reservas activas). |
| I7 | 🟠 | ⚠️ | index.js:2829-2840 (un solo adminMiddleware para todo), AuthGuard.tsx:5-12 (default = los 4 roles), AdminLayout.tsx:15-45 (menú sin filtro por rol), grep de checks por rol solo encuentra index.js:7501 (debug de wallet). |
| I8 | 🟠 | ⚠️ | index.js:2010-2017 (regex isAdminPath sin memberships/classes/class-types/schedules), index.js:1399 (tabla), index.js:7730 (endpoint), AuditLogPage.tsx:284 (UI solo admin/super_admin). |
| I9 | 🟡 | ✅ | Configuración editable desde el panel: tabla settings (index.js:1456) + GET/PUT /api/settings/:key (index.js:9470-9477). SettingsPage.tsx con tabs General/Pagos/Cancelaciones/Notificaciones/Políticas/WhatsApp: ventana de cancelación editable (cancellation_window con min_hours, cancelaciones gratis por membresía, mensaje, SettingsPage.tsx:60-106), validación manual de transferencias (payment_validation, SettingsPage.tsx:220-236), políticas de texto (policies_settings 903-912) y templates de notificación (461-514). El enforcement LEE de settings, no está hardcodeado: getSettingValueWithDefaults('cancellation_window') en el flujo de cancelación (index.js:3657-3667, también 3855 y 9409) y paymen |
| I10 | 🟡 | ➖ | N/A por perfil de operación: VARRE24 es un solo estudio (Nápoles, CDMX), sistema single-tenant sin concepto de sucursal en el schema (no existe tabla branches ni columna branch_id en classes/bookings/memberships). |
| I11 | 🟠 | ✅ | Trazabilidad completa por clase descontada: tabla membership_credit_log (index.js:1287-1299) guarda old/new/delta, reason, actor_user_id, booking_id y notes por cada movimiento; se escribe en todos los flujos que tocan créditos (16 call sites de logCreditChange: reserva 3540, cancelación 3743/3755, invitada 3925/3937, asignación admin 12029, no-show refund 12420, etc.). GET /api/admin/users/:id/credit-history (index.js:10816-10835) joinéa bookings→classes para mostrar qué reserva, de qué clase (fecha/hora) e invitada consumió cada crédito, más quién lo hizo. UI: pestaña 'Créditos' en ClientDetail.tsx:476-531 con motivo en español (creditReasonLabel 31-50), clase, cambio y saldo resultante; t |

### Gaps de I — qué pasa hoy / qué debería pasar

**I3 ⚠️ 🔴**
- *Hoy:* Búsqueda por nombre/email/teléfono funciona (GET /api/users con normalización de dígitos telefónicos index.js:10766-10777; ClientsList.tsx:92-98) y el perfil muestra saldo, vigencia, historial de reservas, pagos y créditos (ClientDetail.tsx:350-531). Pero NO hay notas internas del staff: lo único es health_notes, que la propia clienta ve y edita desde su perfil (mapUser index.js:2856 la expone y PUT /api/users/:id:8057 solo requiere authMiddleware), o sea no es privada de recepción/dueña.
- *Debería:* Campo de notas internas visible solo para staff (ej. users.admin_notes o tabla client_notes con autor y fecha), editable desde ClientDetail y nunca expuesto en los endpoints del cliente.
- *Dónde vive el fix:* frontend/src/pages/admin/clients/ClientDetail.tsx (pestaña Perfil) + tabla users (columna nueva tipo admin_notes)

**I5 ⚠️ 🟠**
- *Hoy:* El ajuste manual de créditos existe y queda en membership_credit_log con actor y reason 'admin_manual_adjust' (index.js:11560-11568), pero el motivo NO es obligatorio: el backend acepta adjustReason opcional (`notes: adjustReason || null`, index.js:11567) y el frontend ni siquiera lo pide (ClientDetail.tsx:66 solo manda classesRemaining). El ajuste de vigencia (endDate) está soportado por la API pero no tiene UI y no genera ningún log (logCreditChange solo corre si cambia classesRemaining, index.js:11558). Además PUT /api/memberships/:id no cae en admin_audit_log porque el filtro isAdminPath no incluye /api/memberships (index.js:2010-2017).
- *Debería:* Motivo obligatorio en backend (400 si falta adjustReason) y campo de texto requerido en el diálogo; log también para cambios de end_date/status; incluir /api/memberships en el middleware de auditoría.
- *Dónde vive el fix:* PUT /api/memberships/:id (index.js:11531) + diálogo 'Corregir créditos' en ClientDetail.tsx:159-201

**I6 ⚠️ 🟠**
- *Hoy:* Sí se puede vaciar un rango de fechas de un golpe, pero mal para festivos: DELETE /api/admin/classes/force-range (index.js:8676) BORRA clases y reservas sin devolver créditos (comentario explícito 'Sin retornar créditos a membresías' index.js:8697 — está pensado para limpiar test data) y sin notificar a nadie. DELETE /api/classes/week (index.js:8826) rechaza si hay reservas activas. PUT /api/classes/:id/cancel (index.js:8663) solo pone status='cancelled' sin cancelar bookings, reembolsar ni avisar. El único flujo que sí reembolsa y loguea es por reserva individual (PUT /api/admin/bookings/:id/cancel index.js:12167 con logCreditChange 12207), o sea que cerrar un día festivo con reservas implica cancelarlas una por una.
- *Debería:* Flujo 'cerrar día/rango': cancelar las clases del rango, devolver crédito a cada reserva activa (C5 masivo), notificar por email/WhatsApp a las afectadas y dejar registro en auditoría; opcionalmente bloquear la generación de clases en esas fechas.
- *Dónde vive el fix:* Nuevo endpoint tipo POST /api/admin/classes/cancel-range + botón en ClassesCalendar; reutilizar la lógica de reembolso de PUT /api/admin/bookings/:id/cancel (index.js:12167)

**I7 ⚠️ 🟠**
- *Hoy:* Los 4 roles staff existen (users.role; adminMiddleware acepta admin/super_admin/instructor/reception, index.js:2833-2835; AuthGuard.tsx:5) pero NO hay permisos diferenciados: todos los endpoints admin usan el mismo adminMiddleware, así que una recepcionista o instructora puede ver finanzas (GET /api/admin/reports 13680, ReportsPage.tsx:218 usa AuthGuard default), cambiar configuración (SettingsPage.tsx:847 AuthGuard default, PUT /api/settings/:key 9477), borrar clases/usuarios y ajustar créditos. La instructora ve TODO el panel, no solo sus clases (AdminLayout.tsx:15-45 no filtra el menú por rol). Únicas restricciones: AuditLogPage.tsx:284 y DiscountCodesPage.tsx:209 limitan a admin/super_admin SOLO en frontend (el endpoint /api/admin/audit-log 7730 sigue abierto a reception/instructor). Además hay gating inconsistente: Dashboard.tsx:87 exige ['admin','instructor'] y deja fuera a reception y super_admin.
- *Debería:* Matriz de permisos en backend: reception opera (ventas, check-in, clientas) sin reportes financieros ni deletes; instructor solo sus clases/roster; settings/planes/auditoría solo dueña — y el menú del panel filtrado por rol.
- *Dónde vive el fix:* adminMiddleware (index.js:2829) → middlewares por rol (p.ej. requireRole(['admin','super_admin'])) + filtrado de NAV_GROUPS en AdminLayout.tsx:15-45 según user.role

**I8 ⚠️ 🟠**
- *Hoy:* Existe un audit log sólido: tabla admin_audit_log (index.js:1399-1417) con actor/rol/ip/user-agent/payload sanitizado (redacción de passwords/tokens 1960-1978), middleware global no-bloqueante para POST/PUT/PATCH/DELETE (2001-2034), endpoint con filtros GET /api/admin/audit-log (7730) y UI con acciones humanizadas (AuditLogPage.tsx:80+). PERO el filtro isAdminPath solo cubre /api/admin/*, /api/users, /api/instructors, /api/discount-codes, /api/plans y /api/settings — deja FUERA justo acciones sensibles: activación manual de membresías (POST /api/memberships 10931, PUT /api/memberships/:id/activate 11131), ajustes de saldo (PUT /api/memberships/:id 11531), cancelación/borrado de clases vía /api/classes/* (8663, 8826, 8904) y CRUD de /api/class-types y /api/schedules. Irónico: AuditLogPage.tsx:105-128 tiene humanizadores para /classes/week y /classes/:id/cancel que nunca se registran. Los cambios de créditos sí quedan en membership_credit_log con actor (1287), lo que compensa parcialmente.
- *Debería:* Agregar /api/memberships, /api/classes, /api/class-types, /api/schedules y /api/packages al filtro isAdminPath para que activaciones manuales, ajustes y cancelaciones queden en la auditoría.
- *Dónde vive el fix:* adminAuditMiddleware, filtro isAdminPath en index.js:2010-2017


## J — Instructoras  ·  cobertura 70% 🟡

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| J1 | 🟠 | ⚠️ | backend/server/index.js:2834 (adminMiddleware acepta rol 'instructor'), :13646 POST /api/instructors/:id/magic-link (crea user role 'instructor'), :13730-13748 GET /api/admin/classes devuelve current_bookings (ocupación) y acepta filtro instructorId; frontend/src/components/admin/AuthGuard.tsx:5 (ADMIN_ROLES incluye 'instructor'), pages/auth/Login.tsx:60 (instructor → /admin/dashboard), pages/admin/classes/ClassesCalendar.tsx:1000,1037-1072 (calendario con cupo X/Y y dots de ocupación). PERO: tabla instructors (index.js:954-966) NO tiene user_id — no hay vínculo user↔instructora; ningún código filtra clases por la instructora logueada; y el magic link generado apunta a /auth/magic (index.js: |
| J2 | 🟠 | ⚠️ | El dato de salud existe: backend/server/index.js:517 (ALTER TABLE users ADD COLUMN health_notes), editable por la clienta (frontend/src/pages/client/ProfileEdit.tsx:146-149) y visible por clienta individual en admin (pages/admin/clients/ClientDetail.tsx:406). La lista por clase existe: GET /api/classes/:id/roster (index.js:12228-12247) y UI ClassAttendees (pages/admin/classes/ClassesCalendar.tsx:207-310) + roster en pages/admin/bookings/BookingsList.tsx:72-78. PERO el SELECT del roster (index.js:12231-12246) solo trae display_name/email/phone/plan/status — NO incluye u.health_notes, y no existe ningún flag de 'primera vez' en todo el código (grep de primera/first_time/isFirst/first_visit sin |
| J3 | 🟡 | ✅ | backend/server/index.js:12106 PUT /api/bookings/:id/check-in (marca checked_in + loyalty + wallet sync), :12136 PUT /api/bookings/:id/no-show, :12376 PUT /api/admin/bookings/:id/mark-no-show (revertir con opción de devolver crédito), :14953 auto check-in (checkin_method='auto') como respaldo. UI de pasar lista: frontend/src/pages/admin/classes/ClassesCalendar.tsx:282-305 (checkinMutation/noShowMutation en el roster de la clase) y pages/admin/bookings/BookingsList.tsx:89-130,764 ('Lista de alumnos · check-in y asistencia'). Accesible al rol instructor (adminMiddleware index.js:2834 y AuthGuard ADMIN_ROLES). Alimenta F3/C3: status checked_in/no_show se usa en reportes (index.js:9131-9133) y tr |
| J4 | 🟡 | ✅ | backend/server/index.js:13776 PUT /api/admin/classes/:id — detecta instructorChanged (línea 13795), hace UPDATE in-place sin recrear la clase (13798-13810) y notifica async a todas las reservas confirmed/checked_in por email (sendCustomBroadcast, 13851-13861) y WhatsApp (sendConfiguredWhatsAppTemplate, 13864-13872) con template editable 'instructor_changed' (definido en index.js:235-236). UI: frontend/src/pages/admin/classes/ClassesCalendar.tsx:750-763 (changeInstructorMutation con notifyAttendees:true) y 1186-1214 (selector de nueva instructora + confirm '¿Cambiar y notificar a las alumnas reservadas?'). Queda en audit log (pages/admin/audit/AuditLogPage.tsx:120 'Cambió la instructora de un |
| J5 | ⚪ | ⚠️ | backend/server/index.js:9286 GET /api/reports/instructors — cuenta por instructora classes_done (completadas o ya pasadas), classes_upcoming, unique_students y attended; frontend/src/pages/admin/reports/ReportsPage.tsx:104-106 y 550-590 (tabla 'Instructoras': Impartidas/Próximas/Alumnas únicas/Asistencias). PERO el SQL (9288-9301) no acepta startDate/endDate ni ningún parámetro: los conteos son de TODA la historia, no por periodo, así que no sirve directo como base de nómina mensual/quincenal. |

### Gaps de J — qué pasa hoy / qué debería pasar

**J1 ⚠️ 🟠**
- *Hoy:* La instructora solo puede entrar si alguien le crea password manualmente (el magic link lleva a 404); al entrar ve el panel admin COMPLETO con todas las clases de todas las instructoras (y clientas, pagos, reportes), sin ninguna vista personal filtrada de 'sus clases de hoy/semana'.
- *Debería:* Login funcional para instructoras (consumir el magic link o password), vínculo instructors.user_id, y una vista por defecto de SUS clases de hoy/semana con horario y ocupación, sin exponerle el resto del panel.
- *Dónde vive el fix:* backend: columna instructors.user_id + ruta que consuma el magic link (/api/auth/magic); frontend: App.tsx ruta /auth/magic + vista 'Mis clases' (hoy/semana) en pages/admin que llame GET /api/admin/classes?instructorId= ligado al usuario logueado

**J2 ⚠️ 🟠**
- *Hoy:* La instructora/recepción ve la lista de reservadas de la clase sin ninguna alerta de salud; para saber si alguien tiene lesión debe abrir clienta por clienta en /admin/clients/:id. No hay indicador de si alguien viene por primera vez.
- *Debería:* El roster de cada clase debe mostrar un badge visible con las notas de salud/lesiones de cada alumna (si existen) y marcar quién toma clase por primera vez.
- *Dónde vive el fix:* backend GET /api/classes/:id/roster (index.js ~12231, agregar u.health_notes y un booleano is_first_time vía NOT EXISTS de bookings previos checked_in) + frontend ClassAttendees (ClassesCalendar.tsx:207) y roster de BookingsList.tsx (badge de alerta de salud y de primera vez)

**J5 ⚠️ ⚪**
- *Hoy:* La dueña ve cuántas clases ha impartido cada instructora en total acumulado desde siempre; para pagar por quincena/mes tendría que contar a mano en el calendario.
- *Debería:* El conteo de clases impartidas por instructora debe filtrarse por periodo (rango de fechas) para servir como base de nómina/comisiones.
- *Dónde vive el fix:* backend GET /api/reports/instructors (index.js:9286, aceptar startDate/endDate sobre c.date) + frontend ReportsPage.tsx (conectar el selector de rango rangeStart de la línea 114 a la query 'reports-instructors')


## K — Reportes y métricas  ·  cobertura 42% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| K1 | 🟠 | ⚠️ | backend/server/index.js:9117-9125 (overview monthlyRevenue = orders approved + membresías manuales), :9182-9217 (/api/reports/revenue 12 meses), :9222-9245 (/api/reports/orders por rango con total y payment_method por fila), :13038-13105 (/api/payments con rango, método por fila y total). frontend/src/pages/admin/reports/ReportsPage.tsx:232-481 (Ingresos del mes, Detalle por fechas, Ingresos por mes 12m). PERO: grep 'GROUP BY.*payment_method' en index.js = 0 resultados; el desglose por método solo existe fila por fila (ReportsPage.tsx:371-393, PaymentsPage.tsx:713-714). El único agregado por paquete (topPlans, index.js:13703-13711 en /api/admin/reports) no lo consume ningún frontend (grep en |
| K2 | 🟠 | ⚠️ | backend/server/index.js:9130-9159 (classOccupancyRate = asistidas/reservadas del mes, un solo número global; además mide asistencia, no lugares vs cupo), :9252-9270 (/api/reports/classes por tipo de clase: bookings/attended/no_shows, sin relación a capacidad), :9286-9303 (/api/reports/instructors: clases y asistencias por instructora). frontend ClassesCalendar.tsx:1072-1086 (dots booked/cap por clase individual, vista operativa). grep 'occupancy\|ocupaci\|day_of_week' no encuentra ningún reporte por horario ni por día de semana. |
| K3 | 🟠 | ⚠️ | backend/server/index.js:9275-9283 (/api/reports/retention: solo COUNT total de clientas + nuevas en 30 días), :9115 (activeMembers = membresías activas), :9141 (newMembersThisMonth), :9172 (churnRate: 0 — hardcodeado). grep 'renewal.*rate\|tasa\|inactiv\|last_visit' = sin resultados: no hay tasa de renovación, ni lista de clientas que no renovaron, ni activas vs inactivas de clientas, ni serie de nuevas por mes. |
| K4 | 🟠 | ⚠️ | frontend/src/pages/admin/memberships/MembershipsList.tsx:254,259 (tab 'Por vencer (7 días)' pide /memberships?status=expiring) PERO backend/server/index.js:10899 filtra literal m.status = $ y 'expiring' no es un status real (STATUS_OPTIONS en MembershipsList.tsx:25: active/pending_payment/pending_activation/expired/cancelled; grep "status='expiring'" en backend = 0) → la pestaña SIEMPRE devuelve vacío. Mitigante: cron runRenewalReminderCron index.js:15125-15178 avisa automático (email+WhatsApp) a alumnas con 1 clase restante o vencimiento ≤7 días. |
| K5 | 🟡 | ⚠️ | Agregados sin dimensión clienta: backend/server/index.js:9132 (no_shows del mes en overview), :9262 (no_shows por tipo de clase). Datos crudos: :11749-11764 (GET /api/bookings acepta userId y status, filas sin agregación), ClientDetail.tsx:219-221+429 (historial por clienta con status por fila, sin contador; 'no_show' ni siquiera tiene label traducido). Late cancels: solo se calculan al vuelo para la penalización de $70 (index.js:3616 cancellation-quota, :11375-11381 y :11459-11465 usan cancelled_at vs inicio de clase) — grep 'late_cancel' no encuentra ningún reporte admin por clienta/periodo. |
| K6 | 🟡 | ➖ | N/A por perfil de operación: VARRE24 no trabaja con agregadores (TotalPass/Wellhub). grep -rn 'TotalPass\|Wellhub\|Gympass\|classpass' en backend/server/index.js y frontend/src = 0 resultados; no existe canal de asistencia por agregador que conciliar. |
| K7 | 🟡 | ❌ | grep 'csv\|CSV' en backend/server/index.js: único hit línea 2749 es un comentario no relacionado ('normalize as csv list' para parseo de env). grep 'text/csv\|toCsv\|Blob(\|.csv' en frontend/src: solo canvas.toBlob de optimización de imágenes. grep 'Content-Disposition\|attachment\|xlsx' en backend: solo passes de wallet (.pkpass, index.js:7266,7412) y media. No existe ningún export de datos. |

### Gaps de K — qué pasa hoy / qué debería pasar

**K1 ⚠️ 🟠**
- *Hoy:* La dueña ve el total del periodo y cada orden con su método/plan, pero para saber cuánto entró por transferencia vs tarjeta vs efectivo (o por paquete) tiene que sumar renglones a mano.
- *Debería:* El detalle por fechas debe mostrar subtotales agregados: $X tarjeta en línea / $Y transferencia / $Z en estudio, y ventas por paquete en el mismo rango.
- *Dónde vive el fix:* backend /api/reports/orders (o nuevo /api/reports/breakdown) + ReportsPage 'Detalle por fechas' — agregar totales agrupados por payment_method y por plan en el rango elegido

**K2 ⚠️ 🟠**
- *Hoy:* Solo existe un % global de asistencia del mes y tablas por tipo de clase/instructora sin cupo; para saber qué horarios se llenan la dueña tiene que revisar clase por clase en el calendario.
- *Debería:* Reporte de ocupación (lugares reservados / cupo 7) cruzado por horario y día de semana, filtrable por tipo de clase e instructora, para decidir qué horarios abrir/cerrar.
- *Dónde vive el fix:* backend nuevo endpoint /api/reports/occupancy + sección en ReportsPage — agregación reservas/cupo por franja horaria, día de semana, tipo de clase e instructora

**K3 ⚠️ 🟠**
- *Hoy:* El endpoint de retención solo devuelve total de clientas y nuevas en 30 días; churnRate se devuelve siempre en 0; no hay forma de ver quién dejó de venir ni qué % renueva.
- *Debería:* Activas vs inactivas (última visita/membresía), nuevas por mes histórico, tasa de renovación (expiradas que compraron de nuevo en N días) y lista nominal de las que no renovaron.
- *Dónde vive el fix:* backend /api/reports/retention + ReportsPage — comparar membresías vencidas vs renovadas por mes y clientas sin membresía activa / sin visitas recientes

**K4 ⚠️ 🟠**
- *Hoy:* La pestaña 'Por vencer (7 días)' existe en la UI pero está rota: el backend compara contra un status inexistente y devuelve lista vacía siempre. Recepción no tiene lista accionable; solo el cron automático contacta a las alumnas.
- *Debería:* La pestaña debe listar membresías activas que vencen en ≤7 días (o con ≤1 clase restante), con nombre, teléfono y fecha de vencimiento, para que recepción les escriba.
- *Dónde vive el fix:* backend GET /api/memberships (index.js:10888) — special-case status=expiring → WHERE m.status='active' AND m.end_date <= CURRENT_DATE + 7 days; y agregar teléfono/email en la tabla de MembershipsList para que recepción escriba

**K5 ⚠️ 🟡**
- *Hoy:* Hay totales de no-show por mes y por tipo de clase, y el historial individual muestra reservas una por una, pero no existe ranking ni conteo por clienta; las cancelaciones tardías solo viven en la lógica de penalización, invisibles como reporte.
- *Debería:* Tabla 'quiénes faltan mucho': por clienta y periodo, # no-shows y # late cancels (bookings.cancelled_at dentro de la ventana de 4h), ordenable, para aplicar política o hablar con la alumna.
- *Dónde vive el fix:* backend nuevo /api/reports/no-shows + sección en ReportsPage o columna en ClientsList — conteo de no_show y cancelaciones tardías por clienta en un rango

**K7 ❌ 🟡**
- *Hoy:* No hay ninguna forma de exportar clientas, pagos ni asistencias; los datos viven solo en las tablas de la UI y en Postgres. Si la dueña quiere su contabilidad o migrar, no puede llevarse nada.
- *Debería:* Export CSV descargable de clientas (nombre/email/teléfono/fecha alta), pagos (fecha/clienta/plan/método/monto, respetando el rango de fechas del filtro) y asistencias (clase/fecha/clienta/status).
- *Dónde vive el fix:* backend endpoints GET /api/admin/export/{clients,payments,attendance}.csv (adminMiddleware) + botones 'Exportar CSV' en ClientsList, PaymentsPage (historial) y ReportsPage


## L — Seguridad, legal y datos  ·  cobertura 57% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| L1 | 🔴 | ➖ | Sistema single-tenant por diseño (un solo estudio, perfil de operación). grep -in 'tenant\|studio_id\|branch_id\|sucursal' en backend/server/index.js devuelve 0 resultados: ninguna tabla del schema (index.js:498-1678, 30+ CREATE TABLE) tiene columna de tenant. RLS multi-tenant no aplica. |
| L2 | 🟠 | ⚠️ | frontend/src/pages/legal/Privacidad.tsx:59-109 — aviso de privacidad LFPDPPP completo que clasifica 'Datos de salud' como categoría recabada (línea 67), finalidades (línea 80) y derechos ARCO (94-105); editable desde admin vía settings 'policies_settings' (líneas 11-14). backend/server/index.js:517 columna users.health_notes; acceso solo tras adminMiddleware (index.js:2834, roles admin/super_admin/instructor/reception) vía GET /api/users/:id (8538) y UI admin ClientDetail.tsx:406. PERO: el registro solo pide 'Acepto los términos y condiciones' con link muerto href='#' (Register.tsx:35,237-238) — no hay consentimiento EXPRESO para datos sensibles ni link real al aviso; healthNotes se captura  |
| L3 | 🟡 | ⚠️ | Acceso/Rectificación: la clienta ve y edita su perfil (PUT perfil index.js:8068-8095, mapUser index.js:2842-2860 devuelve todos sus datos). Cancelación: solo existe DELETE /api/users/:id admin con 'DELETE FROM users WHERE id = $1' (index.js:10875-10877), borrado duro sin anonimización. Proceso ARCO documentado como trámite manual por email hola@varre24.com con plazo de 20 días hábiles (Privacidad.tsx:94-105). No existe endpoint de auto-eliminación ni de anonimización (grep 'anonimiz\|anonym' = 0 resultados en backend). |
| L4 | 🟠 | ⚠️ | backend/server/index.js:1874-1926 — rate limiter propio in-memory: global /api 180 req/min por IP (líneas 1908-1916, constantes 1844-1845) + limiter estricto 20 req/min para /api/auth/login, /register, /forgot-password y /reset-password (1917-1926), con Retry-After y 429 (1891-1894) y limpieza periódica (1901-1906). PERO: getRateLimitIp toma la PRIMERA entrada de x-forwarded-for directamente del header sin trust proxy (1875-1879) — spoofeable rotando el header, lo que permite bypass para enumeración en register/forgot-password; y /webhooks/mercadopago no está bajo /api → sin rate limit (mitigado por firma HMAC + idempotencia). |
| L5 | 🟠 | ⚠️ | Validación manual por ruta: 127 ocurrencias de res.status(400) en backend/server/index.js; 100% de queries parametrizadas ($1, sin concatenación de input); normalización de email/teléfono (normalizePhoneForStorage index.js:9530, register index.js:2866-2881) y regex de fecha (2876). Sin librería de esquemas en backend (grep zod/joi/yup/express-validator en backend = 0; el zod que aparece es solo del frontend, ClientsList.tsx:34). Hueco concreto: POST /api/users (index.js:10790-10803) toma role del body sin whitelist y lo inserta directo — como adminMiddleware acepta reception/instructor (index.js:2834), una recepcionista puede crear un usuario super_admin. Register tampoco valida formato de e |
| L6 ✔︎ver | 🔴 | ✅ | backend/server/index.js:4160-4183 — mpVerifyWebhookSignature valida HMAC-SHA256 del header x-signature (manifest oficial 'id:...;request-id:...;ts:...;') con crypto.timingSafeEqual; se aplica ANTES de procesar en POST /webhooks/mercadopago (4396-4400, descarta si falla). Defensa en profundidad: handleMpPaymentNotification (4359-4360) siempre consulta el estado real del pago a la API de MP con MP_ACCESS_TOKEN (mpSyncPayment, 4142-4144) antes de activar — un webhook forjado no puede activar paquetes gratis aunque la firma se omitiera. Idempotencia por INSERT UNIQUE en payment_webhook_events (4406-4417, tabla 1211-1221) + monitoreo admin GET /api/admin/payment-webhook-events (7704). Caveat: si  |
| L7 | 🟠 | ❓ | grep -rin 'backup\|pg_dump\|respaldo' sobre backend/, docs/, README.md, PROGRESS.md y railway.json = 0 resultados. railway.json solo define build/startCommand. El Postgres vive en Railway (deploy documentado en memoria del proyecto), que puede ofrecer backups de plataforma, pero no hay evidencia en el repo de que estén habilitados, verificados, ni de un plan de recuperación documentado. |
| L8 ✔︎ver | 🔴 | ✅ | Todas las credenciales de terceros se leen de process.env, nunca de la base: JWT_SECRET (index.js:33), MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET (40-41), EVOLUTION_API_KEY (60-61), GOOGLE_CLIENT_SECRET/REFRESH_TOKEN (338-340), GOOGLE_SA_PRIVATE_KEY / GOOGLE_SA_KEY_JSON_BASE64 (5384-5399), APPLE_APNS_KEY_BASE64 / APPLE_CERT_PASSWORD (5944-5946). Ninguna de las 30+ CREATE TABLE del schema (index.js:498-1678) tiene columnas de credenciales de terceros (password_reset_tokens y apple_wallet_devices guardan tokens de usuario/dispositivo, no secretos del estudio). backend/.env está git-ignored (verificado con git check-ignore → IGNORED) y existe .env.example. Caveat menor de higiene: JWT_SECRET tiene fal |

### Gaps de L — qué pasa hoy / qué debería pasar

**L2 ⚠️ 🟠**
- *Hoy:* El aviso de privacidad existe y menciona datos de salud, pero el checkbox de registro apunta a '#' (ni siquiera enlaza al aviso), no se registra versión/fecha del consentimiento, y no hay consentimiento expreso específico para datos sensibles al capturar health_notes; cualquier rol de staff (recepción/instructora) ve las notas de salud completas.
- *Debería:* Checkbox de registro enlazando al aviso real + consentimiento expreso separado al capturar datos de salud (LFPDPPP art. 9 exige consentimiento expreso para datos sensibles), guardando fecha y versión aceptada; acceso a health_notes limitado a instructora (solo de sus clases) y dueña.
- *Dónde vive el fix:* frontend/src/pages/auth/Register.tsx (checkbox de consentimiento) + frontend/src/pages/client/ProfileEdit.tsx (captura de health_notes) + backend users.accepts_terms (falta columna tipo health_consent_at/privacy_version)

**L3 ⚠️ 🟡**
- *Hoy:* La cancelación depende de que la clienta mande un email y de que un admin ejecute un DELETE duro que destruye historial contable (pagos/órdenes ligados) o falla por FKs; no hay flujo de anonimización, no hay definición de qué pasa con paquete activo, ni registro de solicitudes ARCO.
- *Debería:* Flujo de cancelación que anonimiza datos personales (nombre→'Anonimizada', email/phone/health_notes→null) conservando órdenes y pagos para contabilidad, define el destino del paquete activo, y deja registro auditado de la solicitud ARCO con fecha de resolución.
- *Dónde vive el fix:* backend/server/index.js (endpoint de anonimización tipo POST /api/users/:id/anonymize + self-service DELETE /api/auth/me) y frontend/src/pages/client (sección 'eliminar mi cuenta' en perfil)

**L4 ⚠️ 🟠**
- *Hoy:* El límite se aplica por IP tomada del primer valor de x-forwarded-for que envía el cliente; un atacante que rote ese header obtiene un bucket nuevo por request y bypassea el límite en endpoints de auth (enumeración de emails vía 409 'Este email ya está registrado').
- *Debería:* Configurar app.set('trust proxy', N) según la topología de Railway y usar req.ip (o la última entrada confiable de XFF), e incluir /webhooks/mercadopago en un limiter propio laxo.
- *Dónde vive el fix:* backend/server/index.js función getRateLimitIp (línea 1875) y shouldApply del limiter global (línea 1912)

**L5 ⚠️ 🟠**
- *Hoy:* Cada ruta valida a mano lo mínimo (presencia de campos); campos como role, email y password pasan sin whitelist/formato/longitud, con escalación de privilegios posible vía POST /api/users con role:'super_admin' desde una cuenta de recepción.
- *Debería:* Whitelist de role en POST /api/users (y restringir creación de staff a admin/super_admin), validación de formato de email y contraseña mínima en register, y esquemas de validación (Zod) en toda ruta que escribe a la base.
- *Dónde vive el fix:* backend/server/index.js POST /api/users (línea 10790) y POST /api/auth/register (línea 2866); idealmente capa de validación de esquemas compartida


## EC1-12 — Edge cases — concurrencia, tiempo y pagos  ·  cobertura 62% 🟡

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| EC1 ✔︎ver | 🔴 | ✅ | backend/server/index.js:3388-3401 — POST /api/bookings abre transacción (BEGIN) y hace `SELECT ... FROM classes ... WHERE c.id=$1 FOR UPDATE` antes de validar cupo; la validación de capacidad (3511-3521), el INSERT del booking (3522-3526) y el `UPDATE classes SET current_bookings = current_bookings + $1` (3529-3532) ocurren DENTRO de la misma transacción, así que dos requests simultáneos se serializan en el lock de la clase. Si el cupo está lleno cae a waitlist (3520-3521: `isWaitlist = used >= cap` → status 'waitlist'). Los otros dos caminos de creación también bloquean: admin assign index.js:11915-11920 (`FOR UPDATE OF c`) y walk-in index.js:12277 (`FOR UPDATE`). Además hay índice único pa |
| EC2 ✔︎ver | 🔴 | ✅ | El crédito se descuenta UNA sola vez, al RESERVAR, dentro de la transacción: index.js:3455-3458 bloquea la membresía (`SELECT ... FROM memberships WHERE id=$1 FOR UPDATE`) y 3533-3539 hace el decremento + log en membership_credit_log (tabla de auditoría, index.js:1286-1299). El doble tap lo frena el dup-check dentro del lock (3499-3506, 409 'Ya tienes una reserva') respaldado por el índice único parcial idx_bookings_user_class_active (1443-1446). El check-in NO vuelve a descontar: PUT /api/bookings/:id/check-in (12106-12133) solo cambia status y da puntos de lealtad; el auto-checkin lo dice explícito (14944-14945: 'No toca crédito (ya se descontó al reservar)'). El trigger legacy de Postgres |
| EC3 | 🟡 | ✅ | index.js:2366-2384 — incrementDiscountUsage hace decremento atómico condicional: `UPDATE discount_codes SET uses_count = uses_count + 1 ... WHERE id=$1 AND (max_uses IS NULL OR uses_count < max_uses) RETURNING ...`; si no retorna filas lanza error 409 ('El código alcanzó su límite de usos') que revienta la transacción del caller. Se invoca dentro de transacciones en los 4 flujos: POS checkout (2570), aprobación por webhook MP (4276), verificación admin (12774) y auto-approve de transferencia (15049). La validación previa también filtra `uses_count < max_uses` (2330). Dos canjes simultáneos del último uso: solo el primero en aprobar gana; el segundo recibe 409 y rollback. |
| EC4 | 🟠 | ✅ | Política única y explícita: el crédito se descuenta AL RESERVAR y la membresía debe cubrir LA FECHA DE LA CLASE (no solo hoy). index.js:2258-2264 (comentario de diseño) y 2284 — selectMembershipForClass exige `m.end_date >= COALESCE($3::date, hoy_MX)` donde $3 es la fecha de la clase; se usa la MISMA función en reserva online (3422-3427) y reserva por recepción (11935-11940). Si ninguna membresía llega a esa fecha devuelve error explícito CLASS_AFTER_MEMBERSHIP_EXPIRY con fechas (3441-3448). El check-in no re-valida vigencia (12106-12133), y el cron de expiración respeta las clases ya apartadas: reconcileExpiredMemberships NO expira membresías con 0 créditos pero reservas futuras (15399-1540 |
| EC5 | 🟡 | ❌ | No existe flujo de congelación. 'paused' solo aparece como valor permitido en la validación del PUT admin (index.js:11535 VALID_MEMBERSHIP_STATUS incluye 'paused') y en un filtro de reporte (13069, 13089). grep de 'pause/paused/congel/pausar' no encuentra ningún endpoint de congelación, ninguna extensión de end_date por el periodo congelado, ni manejo de reservas futuras; grep en frontend/src/pages/admin tampoco encuentra UI de pausar/congelar. |
| EC6 | 🟡 | ⚠️ | Lo bueno: columnas TIMESTAMP WITH TIME ZONE en todo el schema (p.ej. index.js:649-650, 1297 TIMESTAMPTZ); las clases guardan date+start_time como hora de pared y TODAS las comparaciones críticas convierten con `AT TIME ZONE 'America/Mexico_City'`: ventana de cancelación (3678), quitar invitada (3868), auto-checkin (14960), crons de recordatorio (15203-15204, 15225-15226), expiración de membresías (15393 con comentario explícito 'el server corre en UTC'). Lo que cojea: (1) scheduleEmailCrons calcula la hora MX con offset fijo UTC-6 hardcodeado (15431-15432, comentario 'adjust for daylight saving if needed') — hoy es correcto porque CDMX abolió el horario de verano, pero es una segunda fuente  |
| EC7 | 🟡 | ✅ | index.js:15180-15188 — estrategia 'two-shot' documentada exactamente para este caso: los recordatorios de clases matutinas (antes de mediodía, incluida la de 6am) se envían a las 9:00 PM hora MX del día anterior, y los de clases vespertinas a las 8:00 AM del mismo día (disparadores en 15447-15459 con mexicoHour===21 y ===8) — nunca de madrugada. Mensajes escalonados 3 min entre sí (15189 CLASS_REMINDER_STAGGER_MS) para no saturar Evolution API, y dedup por reserva en whatsapp_reminders_sent con PRIMARY KEY booking_id (15239-15243) + filtro de ya-enviados (15247-15254), así que cada booking se recuerda una sola vez. |
| EC8 | 🟠 | ⚠️ | La asignación manual SÍ soporta inicio retroactivo: POST /api/memberships acepta startDate del body (index.js:10933) y calcula la vigencia desde ahí (10958-10959: `endStr = calcMembershipEndDate(startStr, plan)`); el admin UI expone el DatePicker (frontend/src/pages/admin/clients/ClientsList.tsx:502 y payments/PaymentsPage.tsx:125). Lo que cojea: (1) la verificación de transferencia (PUT /api/admin/orders/:id/verify, index.js:12727) y la activación por webhook MP (4237) hardcodean `todayStr = new Date().toISOString().slice(0,10)` — si recepción verifica el jueves un pago del lunes, la membresía inicia el jueves sin opción de backdatear; (2) PUT /api/memberships/:id permite editar end_date pe |
| EC9 ✔︎ver | 🔴 | ✅ | index.js:1211-1220 — tabla payment_webhook_events con `UNIQUE(provider, event_key)`. El handler POST /webhooks/mercadopago (4386) inserta el evento ANTES de ejecutar efectos: 4404-4417 `eventKey = payment:<mpPaymentId>` → INSERT; si choca con 23505 retorna sin procesar ('ya procesado'). Defensa en profundidad adicional: verificación de firma HMAC (4160-4183, 4397), approveOrderFromMP re-chequea status con `SELECT ... FOR UPDATE` y sale si ya está approved (4213-4216 y atajo 4196-4205), y hay índice único en memberships(order_id) (1224) que impide dos membresías por la misma orden. Tres reenvíos del mismo evento = una sola activación. |
| EC10 ✔︎ver | 🔴 | ⚠️ | El webhook es la ÚNICA vía automática de activación: mpSyncPayment (consulta a api.mercadopago.com/v1/payments) solo se invoca desde el propio webhook (index.js:4360, único call-site). El back_url regresa al frontend, que solo hace polling del estado LOCAL cada 3s (frontend/src/pages/client/MyOrders.tsx:43-52, comentario 'el webhook tarda unos segundos') — nunca consulta a MP. No existe cron de reconciliación contra payments/search (grep sin resultados) ni endpoint para reprocesar eventos: GET /api/admin/payment-webhook-events (7704-7727) es solo lectura, y el comentario en 4428 admite 'se puede reprocesar manualmente' sin que exista la herramienta. Agravante: el INSERT de idempotencia ocurr |
| EC11 | 🟠 | ❌ | No existe flujo de reembolso de paquetes. Todos los hits de 'refund' en index.js son devolución de CRÉDITOS por cancelación de reserva (3666, 3713-3763, 11856-11887, 12374-12432), no reembolso de dinero. PUT /api/memberships/:id/cancel (11181-11193) solo marca status='cancelled' sin cálculo proporcional, sin registro en payments con status 'refunded', y sin integración con la API de refunds de MP. Lo único a favor: el historial de asistencias NO se borra (DELETE de membresía desliga bookings con membership_id=NULL en 11213 en vez de borrarlas, y las asistencias checked_in persisten). |
| EC12 | 🟡 | ❌ | Cero manejo de contracargos: grep de 'chargeback\|contracargo\|charged_back\|in_mediation' = 0 resultados. handleMpPaymentNotification (index.js:4372-4381) solo actúa sobre status 'approved', 'rejected' y 'cancelled' (y estos dos últimos solo si la orden sigue pending_payment). Peor: la clave de idempotencia es `payment:<mpPaymentId>` (4404) — el evento de chargeback de un pago YA aprobado llega con el MISMO payment_id, choca con el UNIQUE(provider,event_key) (1219) y se descarta en 23505 (4414) sin siquiera actualizar mp_payment_status. La membresía sigue activa, la clienta no queda marcada y nadie se entera. |

### Gaps de EC1-12 — qué pasa hoy / qué debería pasar

**EC5 ❌ 🟡**
- *Hoy:* Si el admin cambia status a 'paused' a mano (PUT /api/memberships/:id), las reservas futuras quedan en limbo: siguen 'confirmed' con crédito ya descontado, pero la alumna no puede reservar nada nuevo (selectMembershipForClass exige status='active', línea 2281). La vigencia NO se extiende, así que los días congelados se pierden.
- *Debería:* Al congelar: definir qué pasa con las reservas futuras (cancelarlas devolviendo crédito con aviso, o iniciar la congelación después de la última), y extender end_date por la duración del freeze.
- *Dónde vive el fix:* backend/server/index.js — endpoint nuevo tipo PUT /api/memberships/:id/pause (extender end_date por los días congelados + decidir reservas futuras) y admin ClientsList/Memberships UI

**EC6 ⚠️ 🟡**
- *Hoy:* Activaciones nocturnas (después de 18:00 CDMX) registran start/end con la fecha UTC del día siguiente; el offset UTC-6 de los crons de email está duplicado y hardcodeado.
- *Debería:* Una sola fuente de timezone del estudio usada por queries, crons y cálculo de fechas de membresía (p.ej. (NOW() AT TIME ZONE 'America/Mexico_City')::date en lugar de toISOString()).
- *Dónde vive el fix:* backend/server/index.js — helper único de fecha 'hoy MX' reutilizado en approveOrderFromMP (4237) y verify (12727); una sola constante/setting de timezone

**EC8 ⚠️ 🟠**
- *Hoy:* En el flujo de verificación de comprobantes la vigencia siempre inicia el día de la verificación (la alumna gana días pero el reporte de pagos pierde la fecha real); no hay forma de backdatear una membresía ya creada.
- *Debería:* start_date editable en verify y en el PUT de membresía, vigencia recalculada desde ahí, y paid_at con la fecha real del pago.
- *Dónde vive el fix:* backend/server/index.js PUT /api/admin/orders/:id/verify (aceptar startDate opcional) y PUT /api/memberships/:id (permitir editar start_date); admin Pagos UI

**EC10 ⚠️ 🔴**
- *Hoy:* Si el webhook se pierde o falla a media ejecución, la orden queda pending_payment aunque MP ya cobró; la única salida es que la clienta reclame y recepción apruebe a mano sin verificar contra MP.
- *Debería:* Reconciliación automática: cron o botón que consulte el estado real en MP para órdenes de tarjeta pendientes, y reprocesamiento de eventos con processed_at NULL.
- *Dónde vive el fix:* backend/server/index.js — cron de reconciliación (orders pending_payment/card con >10min consultando mpSyncPayment) o botón admin 'sincronizar con MP' en admin Pagos; mover el marcado de processed_at a después del éxito o permitir re-INSERT si processed_at IS NULL

**EC11 ❌ 🟠**
- *Hoy:* Un reembolso de un 8-pack con 3 clases tomadas se resuelve fuera del sistema (transferencia manual); en la plataforma solo se cancela la membresía sin rastro del monto devuelto, descuadrando reportes de ingresos.
- *Debería:* Cálculo claro y registrado (proporcional o política fija), paquete cancelado, asistencias intactas en el historial.
- *Dónde vive el fix:* backend/server/index.js — endpoint admin de reembolso (cálculo proporcional: precio/clases * restantes según política), registro en payments con status 'refunded', y opcionalmente POST a /v1/payments/:id/refunds de MP; UI en admin Pagos/Membresías

**EC12 ❌ 🟡**
- *Hoy:* Un contracargo de MP es invisible para el sistema: el evento se descarta por la clave de idempotencia y la alumna conserva el paquete completo activo.
- *Debería:* Congelar lo que quede del paquete, marcar el perfil de la clienta y alertar a la dueña (email/WhatsApp admin).
- *Dónde vive el fix:* backend/server/index.js — handler del webhook: incluir el tipo/acción del evento en event_key (p.ej. payment:<id>:<status>) y rama para status charged_back/refunded que congele la membresía (status='paused' o 'cancelled'), marque a la clienta y notifique a la dueña


## EC13-25 — Edge cases — membresías, check-in, datos y humanos  ·  cobertura 59% 🔴

| ID | Sev | Estado | Evidencia / hallazgo |
|---|---|---|---|
| EC13 | 🟠 | ✅ | backend/server/index.js:2265 selectMembershipForClass — única función de elección de paquete, con ORDER BY determinista: categoría específica primero, luego end_date ASC (consume primero la que vence antes) y consciente de la FECHA DE LA CLASE (end_date >= classDate, línea 2284). Usada por AMBOS flujos de consumo: POST /api/bookings (línea 3422, cliente) y POST /api/admin/bookings/assign (línea 11935, recepción). El descuento se hace al reservar con lock SELECT ... FOR UPDATE (líneas 3456 y 3533) y queda auditado en membership_credit_log (logCreditChange, línea 2223). El alta de invitada por admin (línea 11801) usa el membership_id de la propia reserva con FOR UPDATE, no re-elige paquete. |
| EC14 | 🟡 | ⚠️ | backend/server/index.js:896 plan 'Clase de prueba' con repeat_key 'trial_single_session' (membresía separada de 1 crédito, vigencia 7 días); isTrialPlan (2172). La trial NO se descuenta del paquete nuevo: al ser membresía aparte y ordenar por end_date ASC (2302), la trial de 7 días se consume antes que el pack nuevo. Restricciones trial en booking (3473) y admin assign (11964). PERO no existe métrica de conversión trial→compra: /api/reports/retention (9275) solo cuenta usuarios totales/nuevos; grep de 'conversion' en reports no arroja nada (única mención es migrate-urls de videos, 10588). |
| EC15 | 🟡 | ❌ | backend/server/index.js:10875 DELETE /api/users/:id ejecuta 'DELETE FROM users WHERE id = $1' sin ninguna verificación previa. schema_complete.sql:283 (memberships), :461 (bookings), :722 (orders) tienen ON DELETE CASCADE → el borrado arrastra membresías, reservas y órdenes (historial contable destruido). No hay advertencia de saldo vigente, no hay anonimización, y no existe endpoint de auto-eliminación para la clienta (grep 'eliminar cuenta/deleteAccount' en frontend/src no arroja nada). users.is_active existe (línea 521) pero el endpoint de borrado no lo usa como soft-delete. |
| EC16 | 🟡 | ⚠️ | backend/server/index.js:12228 GET /api/classes/:id/roster (lista del día con estado y créditos por alumna) + PUT /api/bookings/:id/check-in (12106) permite captura posterior + cron runAutoCheckin (14947) marca checked_in automáticamente al terminar la clase si nadie capturó. El crédito se descuenta AL RESERVAR (3533), no al check-in, así que la captura tardía no duplica descuentos. PERO: no hay modo offline ni lista cacheada/imprimible (nada de service worker/PWA en frontend), y el check-in manual NO tiene guard de estado previo: re-ejecutar PUT /bookings/:id/check-in inserta puntos de lealtad otra vez (12111-12124, sin verificar si ya estaba checked_in). |
| EC17 | 🟠 | ✅ | backend/server/index.js:6549 triggerWalletPassSync (cola con debounce) llamado en TODO cambio de saldo: booking_created (3603), booking_cancelled (3806), booking_checked_in (12128), membership_created/activated/updated/cancelled (11029/11173/11570/11188), order_verified (12839), mp_payment_approved (4351), transfer_auto_approved/reverted (15121/15361), loyalty (5356/13430). Push APNs real (sendApplePassUpdatedPush 6201, notifyApplePassUpdatedForUser 6434) + sync Google (6394); fallos registrados en wallet_notification_logs (schema 1565, insert 6520) con vista admin GET /api/admin/wallet/notifications (7768) y re-push manual POST /api/admin/wallet/notify/:userId (7790). El staff valida contra |
| EC18 | 🟡 | ⚠️ | backend/server/index.js:5268 y 6369: qrCode = Buffer.from(userId).toString('base64') — QR estático, sin firma, sin rotación, sin expiración (una captura compartida sirve para siempre). Para CLASES no existe endpoint de check-in por QR: checkin_method 'qr_scan' figura en el enum y en el label del admin UI (BookingsList.tsx:281) pero nada en el backend lo setea; el check-in real es manual desde el roster por nombre (12228), lo que de facto hace que un humano identifique a la persona. Para EVENTOS sí hay scan (POST /api/events/:eventId/checkin/scan, 14731) con doble-uso bloqueado (performEventCheckin 14264, 'alreadyCheckedIn' y check not_confirmed 14277) y confirmación por staff. |
| EC19 | 🟠 | ➖ | N/A por perfil de operación: VARRE24 no trabaja con agregadores (TotalPass/Wellhub). grep de 'totalpass\|wellhub\|gympass\|aggregator' en backend/server/index.js no arroja nada; los únicos canales son MercadoPago, transferencia SPEI y efectivo en estudio. |
| EC20 | 🔴 | ➖ | N/A por arquitectura: sistema SINGLE-TENANT (un solo estudio). No existe studio_id/tenant_id en ninguna tabla del schema (grep 'studio_id\|tenant' sin resultados en index.js ni schema_complete.sql); la identidad sale del JWT (req.userId vía authMiddleware) y nunca del body. RLS multi-tenant no aplica. Nota: si algún día se vende como SaaS multi-estudio, habría que rediseñar el aislamiento desde cero. |
| EC21 | 🟡 | ⚠️ | backend/server/index.js:8081 PUT /api/users/:id permite actualizar phone (A3 cumplido, con normalizePhoneForStorage 9530). PERO los fallos de entrega NO se registran en ningún lado: el webhook de Evolution (POST /api/webhook/evolution, 9610) tiene literalmente '// TODO: handle inbound messages / delivery receipts' (9614) y responde 200 sin procesar nada; la cola de envío traga errores silenciosamente ('evolutionSendQueue = run.catch(() => { })', 9564). No existe tabla de log de mensajes WhatsApp por usuario (solo wallet_notification_logs, que es de pases). |
| EC22 | 🟡 | ⚠️ | backend/server/index.js:954 tabla instructors separada SIN user_id (no hay link a users, no hacen login como instructoras); users.role es un solo VARCHAR (503). Una instructora-clienta funciona de facto con cuenta role='client' (los endpoints de reserva solo piden authMiddleware, 3377). PERO si se le asigna role='instructor' para darle vistas de staff (gate en 2079), el frontend la saca de la experiencia de clienta: Login.tsx:60 la redirige a /admin/dashboard y AuthGuard.tsx:5 la trata como ADMIN_ROLES. No hay dual-role real ni vínculo instructora↔usuario (email/teléfono duplicados entre users e instructors). |
| EC23 | 🟠 | ✅ | backend/server/index.js:4724-4725 órdenes cash nacen 'pending_verification'; subida de comprobante POST /api/orders/:id/proof (5013) deja la orden 'pending_verification' hasta aprobación admin (5066-5075, comentario en línea 267). Verificación admin transaccional PUT /api/admin/orders/:id/verify (12668) con SELECT ... FOR UPDATE, verified_at/verified_by (12680). Recepción puede activar manualmente con POST /api/memberships (10930) con paymentMethod/startDate y notas (admin_notes, 10951). Trazabilidad: admin_audit_log (schema 1401, GET /api/admin/audit-log 7730) + membership_credit_log (1285) — la discusión se resuelve con datos. |
| EC24 | 🟡 | ⚠️ | No existe endpoint de 'mover/reprogramar' reserva (grep 'reschedule' sin resultados en index.js). El flujo posible son 2 pasos manuales: PUT /api/admin/bookings/:id/cancel (12167) que SIEMPRE devuelve el crédito sin castigo de late-cancel (restore en 12197-12210) + POST /api/admin/bookings/assign (11901, transaccional con FOR UPDATE de la clase). Sucursal equivocada = N/A (una sola sucursal). El resultado neto no castiga a la clienta, pero depende de que recepción ejecute ambos pasos y puede quedarse a medias si assign falla por cupo lleno tras haber cancelado. |
| EC25 | 🟡 | ⚠️ | backend/server/index.js:515-517 users.emergency_contact_name/phone + health_notes; editable por la clienta y admin vía PUT /api/users/:id (8083) y visible en admin ClientDetail.tsx (frontend). Congelación: status 'paused' es válido en PUT /api/memberships/:id (11535). PERO: (1) el roster de clase GET /api/classes/:id/roster (12231) NO incluye health_notes → las instructoras no ven la condición al pasar lista (J2 roto); (2) pausar NO extiende end_date ni recalcula vigencia (el UPDATE 11549-11557 solo cambia el campo status) → la clienta pierde días congelados; (3) no hay conexión salud→congelación ni flujo de freeze para la clienta: son islas. |

### Gaps de EC13-25 — qué pasa hoy / qué debería pasar

**EC14 ⚠️ 🟡**
- *Hoy:* La trial se maneja bien como membresía separada, pero la conversión (tomó clase muestra → compró paquete) no se registra ni se reporta en ningún lado.
- *Debería:* Un reporte/KPI que cruce memberships trial_single_session con la siguiente compra del mismo user_id (tasa y tiempo de conversión).
- *Dónde vive el fix:* backend/server/index.js /api/reports/* (9106-9307) + frontend/src/pages/admin/reports

**EC15 ❌ 🟡**
- *Hoy:* Borrado físico en cascada: si el admin elimina a una clienta con paquete activo, se pierden sin aviso su saldo, sus asistencias y sus órdenes (lo contable desaparece).
- *Debería:* Advertir el saldo activo antes de borrar, anonimizar (nombre/email/teléfono) en vez de DELETE físico conservando bookings/orders/memberships, y ofrecer flujo de baja para la clienta (LFPDPPP) con política explícita de reembolso o pérdida.
- *Dónde vive el fix:* backend/server/index.js DELETE /api/users/:id (10875) + frontend/src/pages/admin/clients

**EC16 ⚠️ 🟡**
- *Hoy:* Sin internet, la tablet no muestra nada (no hay caché); la captura posterior funciona y no duplica créditos, pero un doble tap de check-in acredita puntos de lealtad duplicados.
- *Debería:* Guard 'WHERE status != checked_in' (o constraint único en loyalty por booking_id) en el check-in, y una vista de roster imprimible/cacheada para operar sin conexión.
- *Dónde vive el fix:* backend/server/index.js PUT /api/bookings/:id/check-in (12106) + frontend/src/pages/admin (roster)

**EC18 ⚠️ 🟡**
- *Hoy:* El QR compartido no da acceso automático a clases porque el check-in es manual por roster, pero el código es base64(userId) trivialmente forjable/replicable; si algún día se activa el scan de clases (el enum ya lo contempla) no habría firma ni expiración que lo proteja.
- *Debería:* QR firmado (HMAC con user_id + fecha) o token rotativo con expiración, y que el escáner muestre nombre/foto al validar.
- *Dónde vive el fix:* backend/server/index.js generación de qrCode (5268, 6369) + flujo de check-in de clases

**EC21 ⚠️ 🟡**
- *Hoy:* Si una clienta cambió de número, todos sus WhatsApp (recordatorios, confirmaciones) caen al vacío sin que nadie se entere; no hay marca en el perfil ni alerta a recepción.
- *Debería:* Procesar delivery receipts del webhook Evolution, registrar fallos por user_id, y mostrar bandera 'WhatsApp no entrega' en el perfil admin para que recepción actualice el número.
- *Dónde vive el fix:* backend/server/index.js webhook /api/webhook/evolution (9610) + perfil de clienta en admin (ClientDetail)

**EC22 ⚠️ 🟡**
- *Hoy:* Funciona solo si la instructora mantiene una cuenta de clienta normal y su ficha de instructors vive aparte; con role='instructor' pierde el flujo de clienta en la app (login la manda al panel admin).
- *Debería:* Vincular instructors.user_id a users y permitir doble sombrero (o al menos que role='instructor' conserve acceso a la app de clienta), sin duplicar datos de contacto.
- *Dónde vive el fix:* backend/server/index.js users.role (503) + tabla instructors (954); frontend/src/pages/auth/Login.tsx:60

**EC24 ⚠️ 🟡**
- *Hoy:* Recepción puede lograr el cambio con cancelar-admin (crédito devuelto) + asignar, pero no es una acción atómica de 'mover'.
- *Debería:* Un endpoint 'mover reserva' que en una sola transacción cancele la original y asigne la nueva (validando cupo antes de soltar el lugar viejo), sin tocar créditos netos.
- *Dónde vive el fix:* backend/server/index.js admin bookings (11897-12230) + frontend/src/pages/admin/bookings

**EC25 ⚠️ 🟡**
- *Hoy:* La ficha de salud existe pero no llega a la instructora en el contexto de la clase, y 'pausar' es solo un cambio de etiqueta que no protege la vigencia pagada.
- *Debería:* health_notes en el roster/detalle de clase para instructoras; congelación real que guarde paused_at y extienda end_date al reactivar; y que actualizar salud (embarazo/lesión) sugiera u ofrezca la congelación en el mismo flujo.
- *Dónde vive el fix:* backend/server/index.js roster (12228) + PUT /api/memberships/:id (11531); frontend admin clients/memberships

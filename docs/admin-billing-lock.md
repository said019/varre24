# Bloqueo del panel por mensualidad

En Railway, abre el servicio que ejecuta `backend/server/index.js` → Variables.

- `ADMIN_BILLING_LOCKED=true`: permite consultar el dashboard y bloquea las demás secciones y acciones del personal (incluye super_admin, recepción e instructoras).
- `ADMIN_BILLING_LOCKED=false`: restaura el acceso normal. El valor predeterminado, si no existe la variable, es false.
- `ADMIN_BILLING_MESSAGE`: opcional, personaliza el texto del aviso. No incluir datos bancarios sensibles ni secretos.

Aplica los cambios y despliega/reinicia el servicio para que tome las variables. No hace falta recompilar el frontend. Las sesiones abiertas actualizan el estado cada 15 segundos y al volver a la pestaña; el servidor aplica el bloqueo desde que arranca con el nuevo valor.

El aviso predeterminado dice: “Tienes un pago pendiente de la mensualidad de tu plataforma. Regulariza tu pago para recuperar el acceso a las funciones administrativas.”

Es un bloqueo de la suscripción de la plataforma del estudio, no de las membresías de las alumnas. Las cuentas de clientas, el sitio público y los webhooks de pagos continúan funcionando. El estado no se puede modificar desde el panel ni mediante una petición de la app. No se borran datos ni se alteran saldos.

## Vista local con datos de demostración

1. `npm ci`
2. `ADMIN_BILLING_LOCKED=true node backend/server/adminBillingPreview.mjs`
3. En otra terminal: `VITE_DEV_API_TARGET=http://127.0.0.1:8089 npm run dev -w frontend -- --host 127.0.0.1`
4. Abre http://localhost:5173/auth/login. Usuario: `demo@varre24.local`, contraseña: `Demo12345!`.

La vista previa usa datos ficticios, escucha exclusivamente en loopback y no se conecta a ninguna base de datos. No utilizarla como servidor de producción. Para comprobar la restauración de acciones, reinicia solo el servidor de demostración con `ADMIN_BILLING_LOCKED=false`.

Prueba de seguridad: `node --test backend/server/tests/admin-billing-lock.test.mjs`.

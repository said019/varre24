import assert from "node:assert/strict";
import test from "node:test";

delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_PUBLIC_URL;
delete process.env.FRONTEND_URL;
process.env.APP_URL = "https://varre24-web-production.up.railway.app";

const {
  sendBirthdayGreeting,
  sendMembershipActivated,
  sendPasswordResetEmail,
  sendBookingConfirmed,
  sendBookingCancelled,
} = await import(`../emailService.js?email-test=${Date.now()}`);

test("reservas conservan el día civil de PostgreSQL y de fechas ISO", async () => {
  for (const date of ["2026-09-23", "2026-09-23T00:00:00.000Z", new Date(2026, 8, 23)]) {
    for (const isWaitlist of [false, true]) {
      const result = await sendBookingConfirmed({
        to: "alumna@example.com", name: "Ana", className: "Pilates",
        date, startTime: "09:00:00", isWaitlist,
      });
      assert.match(result.html, /miércoles, 23 de septiembre de 2026/);
      assert.doesNotMatch(result.html, /22 de septiembre/);
      assert.match(result.html, /9:00 am/);
    }
  }
});

test("cancelaciones conservan el primer día del mes sin retroceder al anterior", async () => {
  const result = await sendBookingCancelled({
    to: "alumna@example.com", name: "Ana", className: "Pilates",
    date: new Date(2026, 9, 1), startTime: "18:30:00", creditRestored: true,
  });
  assert.match(result.html, /jueves, 1 de octubre de 2026/);
  assert.doesNotMatch(result.html, /30 de septiembre/);
  assert.match(result.html, /6:30 pm/);
});

test("los CTA de email nunca exponen el dominio técnico de Railway", async () => {
  const result = await sendMembershipActivated({
    to: "alumna@example.com",
    name: "Ana López",
    planName: "VARRE 8",
    startDate: "2026-07-30",
    endDate: "2026-08-30",
    classLimit: 8,
  });

  assert.equal(result.skipped, true);
  assert.doesNotMatch(result.html, /varre24-web-production\.up\.railway\.app/);
  assert.match(result.html, /https:\/\/www\.varre24fit\.com\/app\/classes/);
  assert.match(result.html, /https:\/\/www\.varre24fit\.com\/brand\/varre24-logo-email-cream\.png/);
});

test("recuperación de contraseña usa el dominio público canónico", async () => {
  const result = await sendPasswordResetEmail({
    to: "alumna@example.com",
    name: "Ana López",
    token: "token-seguro",
    resetUrl: "https://varre24-web-production.up.railway.app/auth/reset-password?token=token-seguro",
  });

  assert.match(result.html, /https:\/\/www\.varre24fit\.com\/auth\/reset-password\?token=token-seguro/);
  assert.doesNotMatch(result.html, /\.up\.railway\.app/);
});

test("la plantilla de cumpleaños mantiene HTML válido dentro del contenido", async () => {
  const result = await sendBirthdayGreeting({
    to: "alumna@example.com",
    name: "Ana López",
    message: "Hoy celebramos tu energía, {name}.",
  });

  assert.match(result.html, /Celebramos contigo/);
  assert.doesNotMatch(result.html, /<tr><td align="center" style="padding:8px 0 24px;">/);
  assert.match(result.html, /Feliz cumplea&ntilde;os/);
});

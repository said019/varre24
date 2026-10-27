-- Walk-ins (bookings.user_id NULL) pueden quedar 'checked_in', pero una
-- solicitud de reseña requiere usuaria registrada (review_requests.user_id
-- NOT NULL). Sin esta guarda el trigger AFTER abortaba la sentencia completa:
-- runAutoCheckin fallaba y ninguna reserva confirmada se marcaba asistida.
-- Idempotente: se aplica en cada arranque.
CREATE OR REPLACE FUNCTION create_review_request()
RETURNS TRIGGER AS $$
DECLARE
    class_end TIMESTAMP WITH TIME ZONE;
BEGIN
    IF NEW.user_id IS NOT NULL AND NEW.status = 'checked_in'
       AND (OLD IS NULL OR OLD.status != 'checked_in') THEN
        SELECT (c.date + c.end_time)::timestamp with time zone
        INTO class_end
        FROM classes c WHERE c.id = NEW.class_id;
        INSERT INTO review_requests (
            booking_id, user_id, class_id, class_ended_at, send_at, status
        ) VALUES (
            NEW.id, NEW.user_id, NEW.class_id,
            class_end, class_end + INTERVAL '2 hours', 'pending'
        )
        ON CONFLICT (booking_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

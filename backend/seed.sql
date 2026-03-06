USE slot_booking;

-- Reset data for a clean demo state
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE bookings;
TRUNCATE TABLE slots;
SET FOREIGN_KEY_CHECKS = 1;

-- 12 total slots: some available (0), some booked (1)
INSERT INTO slots (id, slot_time, is_booked) VALUES
    (1,  '2026-03-06 09:00:00', 0),
    (2,  '2026-03-06 10:00:00', 1),
    (3,  '2026-03-06 11:00:00', 0),
    (4,  '2026-03-06 12:00:00', 1),
    (5,  '2026-03-06 13:00:00', 0),
    (6,  '2026-03-06 14:00:00', 0),
    (7,  '2026-03-06 15:00:00', 1),
    (8,  '2026-03-06 16:00:00', 0),
    (9,  '2026-03-06 17:00:00', 1),
    (10, '2026-03-07 09:00:00', 0),
    (11, '2026-03-07 10:00:00', 0),
    (12, '2026-03-07 11:00:00', 1);

-- Booking rows for slots marked as booked
INSERT INTO bookings (slot_id, user_name, user_email) VALUES
    (2,  'Asha',   'asha@example.com'),
    (4,  'Ravi',   'ravi@example.com'),
    (7,  'Meera',  'meera@example.com'),
    (9,  'Karthik','karthik@example.com'),
    (12, 'Priya',  'priya@example.com');

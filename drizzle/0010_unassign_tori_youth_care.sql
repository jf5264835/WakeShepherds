UPDATE youth_care
SET assigned_user_id = '',
    assigned_to = '',
    updated_at = CURRENT_TIMESTAMP
WHERE assigned_user_id IN (
  SELECT id
  FROM users
  WHERE lower(email) = 'torischklair@gmail.com'
);

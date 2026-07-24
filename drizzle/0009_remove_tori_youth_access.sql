UPDATE users
SET can_access_youth = false,
    can_manage_youth = false,
    updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'torischklair@gmail.com';

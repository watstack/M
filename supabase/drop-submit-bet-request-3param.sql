-- Drop the superseded 3-param submit_bet_request overload.
-- The 4-param version (with p_options_json JSONB DEFAULT NULL) handles both
-- the options and no-options cases, so the 3-param overload is redundant and
-- causes PostgREST overload-resolution failures when the API sends p_options_json.
DROP FUNCTION IF EXISTS submit_bet_request(uuid, uuid, text);

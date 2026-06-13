ALTER TABLE "big_board_entries"
  ADD COLUMN "grade_value" TEXT NOT NULL DEFAULT '';

UPDATE "big_board_entries"
SET "grade_value" = NULLIF(BTRIM("grade"->>'value'), '')
WHERE "grade" IS NOT NULL
  AND jsonb_typeof("grade") = 'object'
  AND jsonb_typeof("grade"->'value') = 'string'
  AND NULLIF(BTRIM("grade"->>'value'), '') IS NOT NULL;

UPDATE "big_board_entries"
SET "grade" = "grade" - 'value'
WHERE "grade" IS NOT NULL
  AND jsonb_typeof("grade") = 'object'
  AND "grade" ? 'value';

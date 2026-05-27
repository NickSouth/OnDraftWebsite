ALTER TABLE "big_board_entries"
  ALTER COLUMN "height_inches" TYPE DOUBLE PRECISION
  USING "height_inches"::DOUBLE PRECISION;

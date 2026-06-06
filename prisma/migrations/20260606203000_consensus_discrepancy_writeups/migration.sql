CREATE TABLE "consensus_discrepancy_writeups" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "player_name" TEXT NOT NULL,
    "ryan_writeup" TEXT NOT NULL DEFAULT '',
    "aleks_writeup" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consensus_discrepancy_writeups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consensus_discrepancy_writeups_year_player_name_key" ON "consensus_discrepancy_writeups"("year", "player_name");
CREATE INDEX "consensus_discrepancy_writeups_year_idx" ON "consensus_discrepancy_writeups"("year");
CREATE INDEX "consensus_discrepancy_writeups_published_idx" ON "consensus_discrepancy_writeups"("published");

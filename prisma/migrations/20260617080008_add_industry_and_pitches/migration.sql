-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "industry" TEXT;

-- CreateTable
CREATE TABLE "industry_pitches" (
    "id" SERIAL NOT NULL,
    "keyword" TEXT NOT NULL,
    "pitch" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "industry_pitches_pkey" PRIMARY KEY ("id")
);

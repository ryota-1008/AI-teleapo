-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "company" TEXT,
    "person" TEXT,
    "phone" TEXT NOT NULL,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT '未架電',
    "next_call_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" SERIAL NOT NULL,
    "contact_id" INTEGER,
    "mode" TEXT NOT NULL,
    "result" TEXT,
    "note" TEXT,
    "transcript" TEXT,
    "analysis" TEXT,
    "el_conversation_id" TEXT,
    "twilio_call_sid" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scripts" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "calls_el_conversation_id_idx" ON "calls"("el_conversation_id");

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

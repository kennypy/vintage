-- CreateEnum
CREATE TYPE "NFeStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REJECTED', 'CANCELLED');

-- AlterTable: Add cnpj fields to User
ALTER TABLE "User" ADD COLUMN "cnpj" TEXT,
ADD COLUMN "cnpjVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_cnpj_key" ON "User"("cnpj");

-- AlterTable: Add shippingAddressId to Order
ALTER TABLE "Order" ADD COLUMN "shippingAddressId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "nfeId" TEXT,
    "accessKey" VARCHAR(44),
    "xml" TEXT,
    "pdfUrl" TEXT,
    "status" "NFeStatus" NOT NULL DEFAULT 'PENDING',
    "sellerCnpj" TEXT,
    "buyerCpf" TEXT,
    "originState" VARCHAR(2) NOT NULL,
    "destinationState" VARCHAR(2) NOT NULL,
    "icmsBrl" DECIMAL(10,2) NOT NULL,
    "issBrl" DECIMAL(10,2) NOT NULL,
    "totalTaxBrl" DECIMAL(10,2) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_orderId_key" ON "NotaFiscal"("orderId");

-- CreateIndex
CREATE INDEX "NotaFiscal_orderId_idx" ON "NotaFiscal"("orderId");

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

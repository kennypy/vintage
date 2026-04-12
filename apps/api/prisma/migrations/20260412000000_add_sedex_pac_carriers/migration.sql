-- Migration: Add SEDEX and PAC carrier options
ALTER TYPE "Carrier" ADD VALUE IF NOT EXISTS 'SEDEX';
ALTER TYPE "Carrier" ADD VALUE IF NOT EXISTS 'PAC';

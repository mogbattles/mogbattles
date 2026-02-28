-- Add thumbnail_url column to arenas table for custom arena images
ALTER TABLE arenas ADD COLUMN IF NOT EXISTS thumbnail_url text;

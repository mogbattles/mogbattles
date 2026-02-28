-- Rename category arenas to "All [Category]" to make room for sub-arenas
-- e.g. "Actors" → "All Actors", "Athletes" → "All Athletes"
-- Safe to re-run (only updates where name doesn't start with 'All ')

UPDATE arenas SET name = 'All Actors' WHERE slug = 'actors' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All Athletes' WHERE slug = 'athletes' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All Singers' WHERE slug = 'singers' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All Models' WHERE slug = 'models' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All Streamers' WHERE slug = 'streamers' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All Politicians' WHERE slug = 'politicians' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All Political Commentators' WHERE slug = 'political-commentators' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All Looksmaxxers' WHERE slug = 'looksmaxxers' AND name NOT LIKE 'All %';
UPDATE arenas SET name = 'All PSL Icons' WHERE slug = 'psl-icons' AND name NOT LIKE 'All %';

-- Online games: multiplayer or server-hosted games that run on the developer's own website.
-- GlitchBox lists them with a full store page, and Play opens the game's own address.
ALTER TABLE games ADD COLUMN online_url TEXT NOT NULL DEFAULT '';

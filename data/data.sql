INSERT INTO users(avatar_url, login, name, type, bio, home_url, github_id, active, stripe_customer_id, email, flag_create_team, flag_data_connectors, github_login) VALUES
  ('https://avatars2.githubusercontent.com/u/43?v=4', 'example', 'Example User', 'individual', 'An example user.', '', 43, TRUE, NULL, '', FALSE, FALSE, NULL),
  ('https://avatars2.githubusercontent.com/u/32314?v=4', 'tmcw', 'Tom MacWright', 'individual', 'creator of open source, like @documentationjs @simple-statistics & more', 'https://macwright.org/', 32314, TRUE, NULL, 'tom@observablehq.com', TRUE, TRUE, 'tmcw'),
  ('https://avatars2.githubusercontent.com/u/230541?v=4', 'mbostock', 'Mike Bostock', 'individual', 'Code and data for humans. Founder @observablehq. Creator @d3. Former @nytgraphics. Pronounced BOSS-tock.', 'https://bost.ocks.org/mike/', 230541, TRUE, NULL, 'mike@observablehq.com', TRUE, TRUE, 'mbostock'),
  ('https://avatars2.githubusercontent.com/u/230542?v=4', 'title-changer', 'Title Changer', 'individual', '', '', 230542, TRUE, NULL, '', TRUE, FALSE, NULL),
  ('https://avatars2.githubusercontent.com/u/4001?v=4', 'banny', 'Banny McBannerson', 'individual', 'An example bad, inactive user.', '', 4001, FALSE, NULL, '', FALSE, FALSE, 'banny'),
  ('https://avatars2.githubusercontent.com/u/101?v=4', 'alice', 'Alice', 'individual', '', '', 101, TRUE, NULL, 'alice@example.com', TRUE, FALSE, 'alice'),
  ('https://avatars2.githubusercontent.com/u/202?v=4', 'bob', 'Bob', 'individual', '', '', 202, TRUE, NULL, 'bob@example.com', TRUE, FALSE, 'bob'),
  ('https://avatars2.githubusercontent.com/u/303?v=4', 'carlos', 'Carlos', 'individual', '', '', 303, TRUE, NULL, 'carlos@example.com', TRUE, FALSE, 'carlos'),
  ('https://avatars2.githubusercontent.com/u/30080011?v=4', 'observablehq', 'Observable', 'team', 'A better way to code.', 'https://observablehq.com/', NULL, TRUE, 'cus_DJH71LZJ68KEBh', 'billing@observablehq.com', FALSE, TRUE, NULL),
  ('https://avatars2.githubusercontent.com/u/30080012?v=4', 'letters', 'Letters', 'team', 'A team for ephemeral users created with createUser()', 'https://letters.com/', NULL, TRUE, 'cus_DJH71LZJ68KEBf', 'letters@letters.com', FALSE, FALSE, 'letters'),
  ('https://avatars2.githubusercontent.com/u/303?v=4', 'team', 'Team team', 'team', 'A team with no aggregate tests', 'https://example.com/', NULL, TRUE, 'cus_DJH71LZJ68KEBf', 'team@example.com', FALSE, TRUE, 'example-team');

INSERT INTO team_members(team_id, user_id, role) VALUES
  ((SELECT id FROM users WHERE login = 'observablehq'), (SELECT id FROM users WHERE login = 'mbostock'), 'owner'),
  ((SELECT id FROM users WHERE login = 'observablehq'), (SELECT id FROM users WHERE login = 'tmcw'), 'member'),
  ((SELECT id FROM users WHERE login = 'team'), (SELECT id FROM users WHERE login = 'alice'), 'owner'),
  ((SELECT id FROM users WHERE login = 'team'), (SELECT id FROM users WHERE login = 'bob'), 'member'),
  ((SELECT id FROM users WHERE login = 'team'), (SELECT id FROM users WHERE login = 'carlos'), 'viewer');

INSERT INTO documents(user_id, slug, trashed, trash_time, publish_time, likes) VALUES
  ((SELECT id FROM users WHERE login = 'mbostock'), 'hello-world', FALSE, NULL, '2017-10-11 01:02', 0),
  ((SELECT id FROM users WHERE login = 'mbostock'), 'another-test', FALSE, NULL, '2017-10-11 02:04', 0),
  ((SELECT id FROM users WHERE login = 'mbostock'), NULL, FALSE, NULL, NULL, 0),
  ((SELECT id FROM users WHERE login = 'tmcw'), 'trash-old', TRUE, NOW() - INTERVAL '1 hours', '2017-10-11 04:02', 0),
  ((SELECT id FROM users WHERE login = 'tmcw'), 'trash-new', TRUE, NOW() + INTERVAL '1 hours', '2017-10-11 04:02', 0),
  ((SELECT id FROM users WHERE login = 'tmcw'), 'hello-tom', FALSE, NULL, NOW() - INTERVAL '1 hours', 2),
  ((SELECT id FROM users WHERE login = 'example'), 'three', FALSE, NULL, '2017-10-11 05:02', 0),
  ((SELECT id FROM users WHERE login = 'banny'), 'spam', TRUE, NOW() + INTERVAL '1 hours', NOW() - INTERVAL '10 hours', 0),
  ((SELECT id FROM users WHERE login = 'observablehq'), 'team-notebook', FALSE, NULL, '2017-11-11 11:11', 5),
  ((SELECT id FROM users WHERE login = 'observablehq'), NULL, FALSE, NULL, NULL, 5),
  ((SELECT id FROM users WHERE login = 'title-changer'), NULL, FALSE, NULL, NULL, 0);

INSERT INTO documents(user_id, title, slug, trashed, trash_time, fork_id, fork_version) VALUES
  ((SELECT id FROM users WHERE login = 'tmcw'), 'Hello, world!', 'hello-fork', FALSE, NULL, (SELECT id FROM documents WHERE slug = 'hello-world'), 3),
  ((SELECT id FROM users WHERE login = 'example'), 'Hello, world!', 'trivial-fork', FALSE, NULL, (SELECT id FROM documents WHERE slug = 'hello-world'), 3);

INSERT INTO document_events(id, user_id, version, time, type, node_id, new_node_value, new_node_pinned) VALUES
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 0, '2017-10-11 01:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 1, '2017-10-11 01:01', 'insert_node', 1, 'md`# Hello, world!`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 2, '2017-10-11 01:02', 'modify_title', NULL, 'Hello, world!', NULL),
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 3, '2017-10-11 01:03', 'insert_node', 3, 'md`I am a paragraph.`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 4, '2017-10-11 01:04', 'modify_node', 3, 'md`I am a new paragraph.`', NULL),
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 5, '2017-10-11 01:05', 'pin_node', 3, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'another-test'), (SELECT id FROM users WHERE login = 'mbostock'), 0, '2017-10-11 02:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'another-test'), (SELECT id FROM users WHERE login = 'mbostock'), 1, '2017-10-11 02:01', 'insert_node', 1, 'md`# Another Test`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'another-test'), (SELECT id FROM users WHERE login = 'mbostock'), 2, '2017-10-11 02:02', 'modify_title', NULL, 'Another Test', NULL),
  ((SELECT id FROM documents WHERE slug = 'another-test'), (SELECT id FROM users WHERE login = 'mbostock'), 3, '2017-10-11 02:03', 'insert_node', 3, 'md`First.`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'another-test'), (SELECT id FROM users WHERE login = 'mbostock'), 4, '2017-10-11 02:04', 'insert_node', 4, 'md`I like D3.js.`', FALSE),
  ((SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'mbostock')), (SELECT id FROM users WHERE login = 'mbostock'), 0, '2017-10-11 03:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'mbostock')), (SELECT id FROM users WHERE login = 'mbostock'), 1, '2017-10-11 03:01', 'insert_node', 1, 'md`# Hello World`', FALSE),
  ((SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'mbostock')), (SELECT id FROM users WHERE login = 'mbostock'), 2, '2017-10-11 03:02', 'modify_title', NULL, 'Hello World', NULL),
  ((SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'mbostock')), (SELECT id FROM users WHERE login = 'mbostock'), 3, '2017-10-11 03:03', 'insert_node', 3, 'md`I am a paragraph.`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'trash-old'), (SELECT id FROM users WHERE login = 'tmcw'), 0, '2017-10-11 04:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'trash-old'), (SELECT id FROM users WHERE login = 'tmcw'), 1, '2017-10-11 04:01', 'modify_title', 1, '`Trash Old`', NULL),
  ((SELECT id FROM documents WHERE slug = 'trash-new'), (SELECT id FROM users WHERE login = 'tmcw'), 0, '2017-10-11 04:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'trash-new'), (SELECT id FROM users WHERE login = 'tmcw'), 1, '2017-10-11 04:01', 'modify_title', 1, '`Trash New`', NULL),
  ((SELECT id FROM documents WHERE slug = 'hello-tom'), (SELECT id FROM users WHERE login = 'tmcw'), 0, '2017-10-11 04:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'hello-tom'), (SELECT id FROM users WHERE login = 'tmcw'), 1, '2017-10-11 04:01', 'modify_title', 1, 'Hello, Tom!', NULL),
  ((SELECT id FROM documents WHERE slug = 'three'), (SELECT id FROM users WHERE login = 'example'), 0, '2017-10-11 05:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'three'), (SELECT id FROM users WHERE login = 'example'), 1, '2017-10-11 05:01', 'insert_node', 1, 'md`# Three`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'three'), (SELECT id FROM users WHERE login = 'example'), 2, '2017-10-11 05:02', 'modify_title', 2, 'Three', NULL),
  ((SELECT id FROM documents WHERE slug = 'hello-fork'), (SELECT id FROM users WHERE login = 'tmcw'), 3, '2017-10-11 05:04', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'hello-fork'), (SELECT id FROM users WHERE login = 'tmcw'), 4, '2017-10-11 05:03', 'insert_node', 4, 'md`I am a forked document.`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'trivial-fork'), (SELECT id FROM users WHERE login = 'example'), 3, '2017-10-12 05:04', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 0, '2017-10-11 06:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 1, '2017-10-11 06:01', 'insert_node', 1, 'md`# Buy Viagra!`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 2, '2017-10-11 06:02', 'modify_title', NULL, 'Buy Viagra!', NULL),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 3, '2017-10-11 06:03', 'insert_node', 3, 'md`I am completely legitimate content.`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 4, '2017-10-11 06:04', 'modify_node', 3, 'md`Please click [here](http://spam.com/).`', NULL),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 5, '2017-10-11 06:05', 'pin_node', 3, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'team-notebook'), (SELECT id FROM users WHERE login = 'tmcw'), 0, '2017-10-11 05:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug = 'team-notebook'), (SELECT id FROM users WHERE login = 'tmcw'), 1, '2017-10-11 05:01', 'insert_node', 1, 'md`# Team Notebook`', FALSE),
  ((SELECT id FROM documents WHERE slug = 'team-notebook'), (SELECT id FROM users WHERE login = 'tmcw'), 2, '2017-10-11 05:02', 'modify_title', 2, 'Team Notebook', NULL),
  ((SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'observablehq')), (SELECT id FROM users WHERE login = 'mbostock'), 0, '2017-10-11 05:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'observablehq')), (SELECT id FROM users WHERE login = 'mbostock'), 1, '2017-10-11 05:01', 'insert_node', 1, 'md`# Team Unpublished`', FALSE),
  ((SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'observablehq')), (SELECT id FROM users WHERE login = 'mbostock'), 2, '2017-10-11 05:02', 'modify_title', 2, 'Team Unpublished', NULL),
  ((SELECT id FROM documents WHERE user_id = (SELECT id FROM users WHERE login = 'title-changer')), (SELECT id FROM users WHERE login = 'title-changer'), 0, '2018-11-12 00:00', 'create', NULL, NULL, NULL),
  ((SELECT id FROM documents WHERE user_id = (SELECT id FROM users WHERE login = 'title-changer')), (SELECT id FROM users WHERE login = 'title-changer'), 1, '2018-11-12 00:00', 'modify_title', NULL, 'first', NULL),
  ((SELECT id FROM documents WHERE user_id = (SELECT id FROM users WHERE login = 'title-changer')), (SELECT id FROM users WHERE login = 'title-changer'), 2, '2018-11-12 00:00', 'modify_title', NULL, 'second', NULL);

INSERT INTO document_publishes(id, user_id, version, title, time) VALUES
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 2, 'Hello, world!', '2017-10-11 01:02'),
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 3, 'Hello, world!', '2017-10-11 01:03'),
  ((SELECT id FROM documents WHERE slug = 'another-test'), (SELECT id FROM users WHERE login = 'mbostock'), 4, 'Another Test', '2017-10-11 02:04'),
  ((SELECT id FROM documents WHERE slug = 'trash-old'), (SELECT id FROM users WHERE login = 'tmcw'), 1, 'Trash Old', '2017-10-11 04:02'),
  ((SELECT id FROM documents WHERE slug = 'trash-new'), (SELECT id FROM users WHERE login = 'tmcw'), 1, 'Trash New', '2017-10-11 04:02'),
  ((SELECT id FROM documents WHERE slug = 'hello-tom'), (SELECT id FROM users WHERE login = 'tmcw'), 1, 'Hello, Tom!', '2017-10-11 05:02'),
  ((SELECT id FROM documents WHERE slug = 'trivial-fork'), (SELECT id FROM users WHERE login = 'example'), 3, 'Hello, world!', '2017-10-12 05:02'),
  ((SELECT id FROM documents WHERE slug = 'three'), (SELECT id FROM users WHERE login = 'example'), 2, 'Three', '2017-10-11 05:02'),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 5, 'Buy Viagra!', '2017-10-11 06:10'),
  ((SELECT id FROM documents WHERE slug = 'team-notebook'), (SELECT id FROM users WHERE login = 'mbostock'), 2, 'Team Notebook', '2017-11-11 12:11'),
  ((SELECT id FROM documents WHERE user_id = (SELECT id FROM users WHERE login = 'title-changer')), (SELECT id FROM users WHERE login = 'title-changer'), 1, 'first', '2018-11-12 00:01');

INSERT INTO document_aliases(id, user_id, slug) VALUES
  ((SELECT id FROM documents WHERE slug = 'hello-world'), (SELECT id FROM users WHERE login = 'mbostock'), 'hello-world'),
  ((SELECT id FROM documents WHERE slug = 'another-test'), (SELECT id FROM users WHERE login = 'mbostock'), 'another-test'),
  ((SELECT id FROM documents WHERE slug = 'trash-old'), (SELECT id FROM users WHERE login = 'tmcw'), 'trash-old'),
  ((SELECT id FROM documents WHERE slug = 'trash-new'), (SELECT id FROM users WHERE login = 'tmcw'), 'trash-new'),
  ((SELECT id FROM documents WHERE slug = 'hello-tom'), (SELECT id FROM users WHERE login = 'tmcw'), 'hello-tom'),
  ((SELECT id FROM documents WHERE slug = 'three'), (SELECT id FROM users WHERE login = 'example'), 'three'),
  ((SELECT id FROM documents WHERE slug = 'spam'), (SELECT id FROM users WHERE login = 'banny'), 'spam'),
  ((SELECT id FROM documents WHERE slug = 'team-notebook'), (SELECT id FROM users WHERE login = 'observablehq'), 'team-notebook'),
  ((SELECT id FROM documents WHERE slug = 'hello-fork'), (SELECT id FROM users WHERE login = 'tmcw'), 'hello-fork'),
  ((SELECT id FROM documents WHERE slug = 'trivial-fork'), (SELECT id FROM users WHERE login = 'example'), 'trivial-fork');

UPDATE document_thumbnails
  SET assigned = TRUE;

UPDATE document_thumbnails
  SET hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  WHERE id IN (SELECT id FROM documents WHERE slug IN ('hello-world', 'another-test'));

INSERT INTO collections(slug, title, description, update_time, user_id, type) VALUES
  ('examples', 'Examples', 'A collection for tests', '2017-11-23 06:00', (SELECT id FROM users WHERE login = 'observablehq'), 'public'),
  ('kittens', 'Kittens', 'Like cats, but cute', '2017-11-23 06:01', (SELECT id FROM users WHERE login = 'observablehq'), 'public'),
  ('private-kittens', 'Private Kittens', 'Like cats, but cute, and also private', '2017-11-23 06:10', (SELECT id FROM users WHERE login = 'observablehq'), 'private'),
  ('empty', 'Empty', 'An empty collection', '2017-11-23 06:03', (SELECT id FROM users WHERE login = 'observablehq'), 'public'),
  ('pizza', 'Pizzas', 'Everything is pizza', '2017-11-23 06:04', (SELECT id FROM users WHERE login = 'observablehq'), 'public');

INSERT INTO collection_documents(id, document_id, update_time) VALUES
  ((SELECT id FROM collections WHERE slug = 'examples'), (SELECT id FROM documents WHERE slug = 'hello-world'), '2017-10-11 01:01'),
  ((SELECT id FROM collections WHERE slug = 'examples'), (SELECT id FROM documents WHERE slug = 'another-test'), '2017-10-11 01:02'),
  ((SELECT id FROM collections WHERE slug = 'examples'), (SELECT id FROM documents WHERE slug = 'hello-tom'), '2017-10-11 01:03'),
  ((SELECT id FROM collections WHERE slug = 'examples'), (SELECT id FROM documents WHERE slug = 'trash-new'), '2017-10-11 01:04'),
  ((SELECT id FROM collections WHERE slug = 'examples'), (SELECT id FROM documents WHERE slug = 'team-notebook'), '2017-10-11 01:05'),
  ((SELECT id FROM collections WHERE slug = 'kittens'), (SELECT id FROM documents WHERE slug = 'hello-world'), '2017-10-11 01:06'),
  ((SELECT id FROM collections WHERE slug = 'kittens'), (SELECT id FROM documents WHERE slug = 'another-test'), '2017-10-11 01:07'),
  ((SELECT id FROM collections WHERE slug = 'kittens'), (SELECT id FROM documents WHERE slug = 'hello-tom'), '2017-10-11 01:08'),
  ((SELECT id FROM collections WHERE slug = 'private-kittens'), (SELECT id FROM documents WHERE slug = 'hello-tom'), '2017-10-11 01:08'),
  ((SELECT id FROM collections WHERE slug = 'private-kittens'), (SELECT id FROM documents WHERE slug IS NULL AND user_id = (SELECT id FROM users WHERE login = 'observablehq')), '2017-10-11 01:08'),
  ((SELECT id FROM collections WHERE slug = 'private-kittens'), (SELECT id FROM documents WHERE slug = 'spam'), '2017-10-11 01:08');

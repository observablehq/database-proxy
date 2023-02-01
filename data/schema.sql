--
-- PostgreSQL database dump
--

-- Dumped from database version 9.6.12
-- Dumped by pg_dump version 9.6.12

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: plpgsql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;


--
-- Name: EXTENSION plpgsql; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION plpgsql IS 'PL/pgSQL procedural language';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA public;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_stat_statements IS 'track execution statistics of all SQL statements executed';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: collection_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.collection_type AS ENUM (
    'public',
    'private'
);


--
-- Name: data_connector_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.data_connector_type AS ENUM (
    'mysql',
    'postgres'
);


--
-- Name: document_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_event_type AS ENUM (
    'create',
    'modify_title',
    'insert_node',
    'remove_node',
    'modify_node',
    'move_node',
    'noop',
    'pin_node',
    'unpin_node',
    'revert',
    'insert_comment',
    'modify_comment',
    'remove_comment'
);


--
-- Name: team_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.team_role AS ENUM (
    'member',
    'owner',
    'viewer'
);


--
-- Name: user_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_type AS ENUM (
    'individual',
    'team'
);


--
-- Name: ban(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ban(user_login character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
  BEGIN
    UPDATE users
      SET active = TRUE
      WHERE login = user_login;
    UPDATE documents
      SET trashed = TRUE, trash_time = NOW() + INTERVAL '45 days'
      WHERE user_id = (SELECT id FROM users WHERE login = user_login)
        AND trashed = FALSE;
    RETURN true;
  END
$$;


--
-- Name: cancel_document_thumbnails(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_document_thumbnails() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    DELETE FROM document_thumbnails
    WHERE assigned = FALSE
    AND id = NEW.id
    AND version <> NEW.version
    AND version NOT IN (SELECT p.version FROM document_publishes p WHERE p.id = NEW.id ORDER BY time DESC LIMIT 1)
    AND version NOT IN (SELECT d.version FROM documents d WHERE d.id = NEW.id);
    RETURN NEW;
  END;
$$;


--
-- Name: compute_document_version_ranges(character, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.compute_document_version_ranges(document_id character, start_version integer, end_version integer) RETURNS TABLE(from_version integer, to_version integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
revert_from_version int;
revert_to_version int;
BEGIN
  to_version := end_version;
  LOOP
    SELECT e.version, e.node_id
      INTO revert_from_version, revert_to_version
      FROM document_events e
      WHERE e.id = document_id
      AND e.type = 'revert'
      AND e.version <= to_version
      AND e.version >= start_version
      ORDER BY e.version DESC
      LIMIT 1;
    IF revert_to_version IS NULL THEN
      from_version := start_version;
      RETURN NEXT;
      RETURN;
    END IF;
    IF revert_from_version < end_version THEN
      from_version := revert_from_version + 1;
      RETURN NEXT;
    END IF;
    to_version := revert_to_version;
  END LOOP;
END
$$;


--
-- Name: decrement_document_likes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_document_likes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    UPDATE documents
    SET likes = likes - 1
    WHERE id = OLD.document_id;
    RETURN OLD;
  END;
$$;


--
-- Name: disallow_document_data_connectors(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disallow_document_data_connectors() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    DELETE FROM data_connectors_documents
    WHERE document_id = NEW.id;
    RETURN NEW;
  END;
$$;


--
-- Name: disallow_document_secrets(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disallow_document_secrets() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    UPDATE documents
    SET allow_secrets = FALSE
    WHERE id = NEW.id
    AND allow_secrets = TRUE;
    RETURN NEW;
  END;
$$;


--
-- Name: global_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.global_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    id CHAR(16);
    query TEXT;
    found INT;
  BEGIN
    IF NEW.id IS NULL THEN
      query := 'SELECT 1 FROM ' || quote_ident(TG_TABLE_NAME) || ' WHERE id=';
      LOOP
        id := encode(gen_random_bytes(8), 'hex');
        EXECUTE query || quote_literal(id) INTO found;
        IF found IS NULL THEN EXIT; END IF;
      END LOOP;
      NEW.id = id;
    END IF;
    RETURN NEW;
  END;
$$;


--
-- Name: increment_document_likes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_document_likes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    UPDATE documents
    SET likes = likes + 1
    WHERE id = NEW.document_id;
    RETURN NEW;
  END;
$$;


--
-- Name: index_document(character, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.index_document(doc_id character, doc_version integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
  DECLARE
    is_published BOOLEAN;
  BEGIN
    SELECT TRUE
      INTO is_published
      FROM document_publishes p
      JOIN documents d ON (p.id = d.id)
      WHERE p.id = doc_id
      AND p.version = doc_version
      AND d.slug IS NOT NULL;
    IF EXISTS(SELECT 1 FROM document_vectors v WHERE v.id = doc_id AND v.version = doc_version) THEN
      IF is_published IS TRUE THEN
        DELETE FROM document_vectors WHERE id = doc_id AND version <> doc_version AND published IS TRUE;
        UPDATE document_vectors SET published = TRUE WHERE id = doc_id AND version = doc_version;
      END IF;
      RETURN;
    END IF;
    WITH RECURSIVE ancestors AS (
      (SELECT d.id, d.version AS ancestor_version, d.fork_version, d.fork_id FROM documents d WHERE d.id = doc_id)
      UNION (SELECT d.id, a.fork_version AS ancestor_version, d.fork_version, d.fork_id FROM ancestors a JOIN documents d ON (d.id = a.fork_id))),
    ranges AS (
      SELECT a.id, r.from_version, r.to_version FROM ancestors a
      LEFT JOIN LATERAL (SELECT from_version, to_version FROM compute_document_version_ranges(a.id, COALESCE(a.fork_version, 0), LEAST(doc_version, a.ancestor_version))) r ON TRUE),
    texts AS (SELECT
      COALESCE(string_agg(e.new_node_value, CHR(10) || CHR(10)), '') AS value
      FROM (
        WITH events AS (SELECT e.type, e.version, e.node_id, e.new_node_value
          FROM ancestors a
          JOIN document_events e ON (e.id = a.id)
          JOIN ranges r ON (e.id = r.id AND r.from_version <= e.version AND r.to_version >= e.version)
          WHERE e.type IN ('insert_node', 'remove_node', 'modify_node')
        )
        SELECT e.*
        FROM events e
        WHERE NOT EXISTS (
          SELECT 1
          FROM events o
          WHERE e.type IN ('insert_node', 'modify_node')
          AND o.type IN ('remove_node', 'modify_node')
          AND o.node_id = e.node_id
          AND o.version > e.version
        )
        ORDER BY e.version ASC
      ) e)
      INSERT INTO document_vectors(id, version, published, vector)
      SELECT
      d.id, doc_version, is_published IS TRUE,
      setweight(to_tsvector('simple', COALESCE((CASE WHEN is_published THEN p.title ELSE d.title END), '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(u.name, '') || ' ' || COALESCE(u.login, '')), 'A') ||
      setweight(to_tsvector('simple', translate(t.value, '.[]{}()*/+', '          ')), 'B') AS vector
      FROM texts t
      JOIN documents d ON (d.id = doc_id)
      JOIN users u ON (u.id = d.user_id)
      LEFT JOIN document_publishes p ON (d.slug IS NOT NULL AND d.id = p.id AND p.version = doc_version)
      ON CONFLICT(id, published) DO UPDATE SET version = EXCLUDED.version, vector = EXCLUDED.vector;
    RETURN;
  END;
$$;


--
-- Name: index_published_document(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.index_published_document() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    PERFORM index_document(NEW.id, NEW.version);
    RETURN NEW;
  END;
$$;


--
-- Name: insert_document_alias(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_document_alias() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    INSERT INTO document_aliases(id, user_id, slug)
    VALUES (NEW.id, NEW.user_id, NEW.slug)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END;
$$;


--
-- Name: insert_document_publish_thumbnail(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_document_publish_thumbnail() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    DELETE FROM document_thumbnails
    WHERE assigned = FALSE
    AND id = NEW.id
    AND version <> NEW.version
    AND version NOT IN (SELECT d.version FROM documents d WHERE d.id = NEW.id);
    INSERT INTO document_thumbnails(id, version, event_time)
    SELECT id, version, time
    FROM document_events
    WHERE id = NEW.id
    AND version = NEW.version
    ON CONFLICT (id, version) DO NOTHING;
    RETURN NEW;
  END;
$$;


--
-- Name: notify_document_comments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_document_comments() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    subject document_comments%ROWTYPE;
    deleted BOOLEAN;
  BEGIN
    CASE TG_OP
      WHEN 'INSERT' THEN
        subject = NEW;
        deleted = FALSE;
      WHEN 'UPDATE' THEN
        subject = NEW;
        deleted = FALSE;
      WHEN 'DELETE' THEN
        subject = OLD;
        deleted = TRUE;
    END CASE;
    PERFORM pg_notify('document_comments', json_build_object('id', subject.document_id, 'comment_id', subject.id, 'deleted', deleted)::TEXT);
    RETURN subject;
  END;
$$;


--
-- Name: notify_document_presence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_document_presence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  DECLARE
    subject document_presence%ROWTYPE;
  BEGIN
    CASE TG_OP
      WHEN 'INSERT' THEN subject = NEW;
      WHEN 'UPDATE' THEN subject = NEW;
      WHEN 'DELETE' THEN subject = OLD;
    END CASE;
    PERFORM pg_notify('document_presence', json_build_object('id', subject.id, 'user_id', subject.user_id)::TEXT);
    RETURN subject;
  END;
$$;


--
-- Name: notify_document_publish(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_document_publish() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    PERFORM pg_notify('document_publishes', json_build_object('id', NEW.id, 'version', NEW.version)::TEXT);
    RETURN NEW;
  END;
$$;


--
-- Name: title_score(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.title_score(query text, title text) RETURNS double precision
    LANGUAGE plpgsql
    AS $$
  DECLARE
  count integer;
  query_words text[] := string_to_array(regexp_replace(query, '\W', ' ', 'g'), ' ');
  title_words text[] := string_to_array(regexp_replace(title, '\W', ' ', 'g'), ' ');
  BEGIN
    count := (SELECT COUNT(*) FROM (SELECT UNNEST(query_words) INTERSECT SELECT UNNEST(title_words)) s);
    RETURN count / ARRAY_LENGTH(query_words, 1)::FLOAT;
END
$$;


--
-- Name: unban(character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unban(user_login character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
  BEGIN
    UPDATE users
      SET active = FALSE
      WHERE login = user_login;
    UPDATE documents
      SET trashed = FALSE, trash_time = NULL
      WHERE user_id = (SELECT id FROM users WHERE login = user_login)
        AND trash_time > NOW() + INTERVAL '30 days';
    RETURN true;
  END
$$;


--
-- Name: update_document_head(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_document_head() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    UPDATE documents
    SET update_time = NEW.time, version = NEW.version, title = CASE
      WHEN NEW.type = 'modify_title' THEN NEW.new_node_value
      WHEN NEW.type = 'revert' THEN (
        WITH RECURSIVE lineage AS (
          (SELECT d.id, d.version + 1 AS version, d.fork_id, d.fork_version
            FROM documents d WHERE d.id = NEW.id)
          UNION (SELECT d.id, d.version, d.fork_id, d.fork_version
            FROM lineage l JOIN documents d ON (d.id = l.fork_id))),
        ranges AS (
          SELECT l.id, r.from_version, r.to_version FROM lineage l
          LEFT JOIN LATERAL (SELECT from_version, to_version FROM compute_document_version_ranges(l.id, COALESCE(l.fork_version, 0), l.version)) r ON TRUE)
        SELECT e.new_node_value
        FROM document_events e
        JOIN lineage l ON (
          (e.id = l.id AND l.id = NEW.id)
          OR (e.id = l.fork_id AND e.version <= l.fork_version)
        )
        JOIN ranges r ON (e.id = r.id AND r.from_version <= e.version AND r.to_version >= e.version)
        WHERE e.type = 'modify_title'
        ORDER BY e.version DESC
        LIMIT 1)
      ELSE title
    END
    WHERE id = NEW.id
    AND version < NEW.version;
    RETURN NEW;
  END;
$$;


--
-- Name: update_document_publish_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_document_publish_time() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN
    UPDATE documents
    SET publish_time = NEW.time
    WHERE slug IS NULL
    AND id = NEW.id;
    RETURN NEW;
  END;
$$;


--
-- Name: user_is_type(character, public.user_type); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_is_type(character, public.user_type) RETURNS boolean
    LANGUAGE sql
    AS $_$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = $1 AND type = $2
  );
$_$;


SET default_tablespace = '';

SET default_with_oids = false;

--
-- Name: collection_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collection_documents (
    id character(16) NOT NULL,
    document_id character(16) NOT NULL,
    update_time timestamp without time zone DEFAULT now()
);


--
-- Name: collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.collections (
    id character(16) NOT NULL,
    slug character varying(255) NOT NULL,
    title character varying(255) NOT NULL,
    description character varying(255) NOT NULL,
    update_time timestamp without time zone DEFAULT now(),
    chronological boolean DEFAULT false NOT NULL,
    user_id character(16) NOT NULL,
    pinned boolean DEFAULT false NOT NULL,
    type public.collection_type DEFAULT 'private'::public.collection_type NOT NULL,
    custom_thumbnail character varying(64) DEFAULT NULL::character varying
);


--
-- Name: data_connectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_connectors (
    user_id character(16) NOT NULL,
    name character varying(255) NOT NULL,
    type public.data_connector_type NOT NULL,
    credentials_iv bytea NOT NULL,
    credentials_red bytea,
    credentials_blue bytea
);


--
-- Name: data_connectors_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_connectors_documents (
    document_id character(16) NOT NULL,
    data_connector_user_id character(16) NOT NULL,
    data_connector_name character varying(255) NOT NULL
);


--
-- Name: document_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_aliases (
    id character(16) NOT NULL,
    user_id character(16) NOT NULL,
    slug character varying(255) NOT NULL
);


--
-- Name: document_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_comments (
    id character(16) NOT NULL,
    user_id character(16) NOT NULL,
    document_id character(16) NOT NULL,
    node_id integer NOT NULL,
    document_version integer NOT NULL,
    content text NOT NULL,
    create_time timestamp without time zone DEFAULT now() NOT NULL,
    update_time timestamp without time zone,
    resolved boolean DEFAULT false NOT NULL
);


--
-- Name: document_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_events (
    id character(16) NOT NULL,
    version integer NOT NULL,
    type public.document_event_type NOT NULL,
    "time" timestamp without time zone DEFAULT now(),
    node_id integer,
    new_node_value text,
    new_next_node_id integer,
    user_id character(16),
    original_document_id character(16),
    original_node_id integer,
    new_node_pinned boolean
);


--
-- Name: document_merges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_merges (
    from_id character(16) NOT NULL,
    from_version integer NOT NULL,
    to_id character(16) NOT NULL,
    to_start_version integer NOT NULL,
    to_end_version integer NOT NULL,
    user_id character(16) NOT NULL,
    "time" timestamp without time zone DEFAULT now()
);


--
-- Name: document_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_presence (
    id character(16) NOT NULL,
    user_id character(16),
    "time" timestamp without time zone DEFAULT now() NOT NULL,
    client_id bigint NOT NULL
);


--
-- Name: document_presence_client_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_presence_client_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_presence_client_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_presence_client_id_seq OWNED BY public.document_presence.client_id;


--
-- Name: document_publishes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_publishes (
    id character(16) NOT NULL,
    version integer NOT NULL,
    user_id character(16),
    "time" timestamp without time zone DEFAULT now(),
    title character varying(255) DEFAULT ''::character varying,
    public boolean DEFAULT false NOT NULL
);


--
-- Name: document_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_suggestions (
    id character(16) NOT NULL,
    user_id character(16) NOT NULL,
    from_id character(16) NOT NULL,
    to_id character(16) NOT NULL,
    create_time timestamp without time zone DEFAULT now() NOT NULL,
    close_time timestamp without time zone,
    description character varying(255) DEFAULT ''::character varying NOT NULL,
    closer_id character(16),
    to_merge_end_version integer
);


--
-- Name: document_thumbnails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_thumbnails (
    id character(16) NOT NULL,
    version integer NOT NULL,
    hash character varying(64) DEFAULT NULL::character varying,
    event_time timestamp without time zone NOT NULL,
    assigned boolean DEFAULT false
);


--
-- Name: document_vectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_vectors (
    id character(16) NOT NULL,
    version integer NOT NULL,
    vector tsvector NOT NULL,
    published boolean DEFAULT false NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id character(16) NOT NULL,
    user_id character(16) NOT NULL,
    version integer DEFAULT '-1'::integer NOT NULL,
    slug character varying(255) DEFAULT NULL::character varying,
    trashed boolean DEFAULT false,
    title character varying(255) DEFAULT ''::character varying,
    update_time timestamp without time zone DEFAULT now(),
    trash_time timestamp without time zone,
    publish_time timestamp without time zone,
    fork_id character(16) DEFAULT NULL::bpchar,
    fork_version integer,
    access_key character(16) DEFAULT encode(public.gen_random_bytes(8), 'hex'::text) NOT NULL,
    likes integer DEFAULT 0 NOT NULL,
    allow_secrets boolean DEFAULT false NOT NULL,
    custom_thumbnail character varying(64) DEFAULT NULL::character varying
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    name character varying(255) NOT NULL,
    start_time timestamp without time zone DEFAULT now(),
    end_time timestamp without time zone
);


--
-- Name: team_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_invitations (
    team_id character(16) NOT NULL,
    owner_id character(16) NOT NULL,
    email character varying(255) NOT NULL,
    create_time timestamp without time zone DEFAULT now() NOT NULL,
    accept_time timestamp without time zone,
    expire_time timestamp without time zone DEFAULT (now() + '3 days'::interval) NOT NULL,
    id character(16) NOT NULL,
    role public.team_role DEFAULT 'member'::public.team_role,
    CONSTRAINT check_invitation_owner CHECK (public.user_is_type(owner_id, 'individual'::public.user_type)),
    CONSTRAINT check_invitation_team CHECK (public.user_is_type(team_id, 'team'::public.user_type))
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    team_id character(16) NOT NULL,
    user_id character(16) NOT NULL,
    role public.team_role DEFAULT 'member'::public.team_role NOT NULL,
    CONSTRAINT check_membership_team CHECK (public.user_is_type(team_id, 'team'::public.user_type)),
    CONSTRAINT check_membership_user CHECK (public.user_is_type(user_id, 'individual'::public.user_type))
);


--
-- Name: user_email_confirmations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_email_confirmations (
    id character(16) NOT NULL,
    email character varying(255) NOT NULL,
    create_time timestamp without time zone DEFAULT now(),
    accept_time timestamp without time zone,
    user_id character(16),
    expire_time timestamp without time zone DEFAULT (now() + '3 days'::interval) NOT NULL
);


--
-- Name: user_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_likes (
    id character(16) NOT NULL,
    document_id character(16) NOT NULL,
    "time" timestamp without time zone DEFAULT now()
);


--
-- Name: user_secrets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_secrets (
    id character(16) NOT NULL,
    name character varying(255) NOT NULL,
    iv bytea NOT NULL,
    value_red bytea,
    value_blue bytea
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character(16) NOT NULL,
    avatar_url character varying(255) DEFAULT NULL::character varying,
    login character varying(40),
    name character varying(255) DEFAULT ''::character varying NOT NULL,
    create_time timestamp without time zone DEFAULT now(),
    bio text DEFAULT ''::text NOT NULL,
    home_url character varying(255) DEFAULT ''::character varying NOT NULL,
    github_id bigint,
    update_time timestamp without time zone DEFAULT now(),
    email character varying(255) DEFAULT ''::character varying NOT NULL,
    type public.user_type DEFAULT 'individual'::public.user_type NOT NULL,
    setting_dark_mode boolean DEFAULT false NOT NULL,
    stripe_customer_id character varying,
    delinquent boolean DEFAULT false NOT NULL,
    flag_create_team boolean DEFAULT false,
    active boolean DEFAULT true,
    setting_autoclose_pairs boolean DEFAULT false NOT NULL,
    twitter_id bigint,
    google_id numeric(50,0),
    github_login character varying(40),
    setting_always_on_autocomplete boolean DEFAULT true NOT NULL,
    flag_data_connectors boolean DEFAULT false NOT NULL,
    CONSTRAINT user_login_lower CHECK (((login)::text = lower((login)::text)))
);


--
-- Name: document_presence client_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_presence ALTER COLUMN client_id SET DEFAULT nextval('public.document_presence_client_id_seq'::regclass);


--
-- Name: collection_documents collection_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_documents
    ADD CONSTRAINT collection_documents_pkey PRIMARY KEY (id, document_id);


--
-- Name: collections collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_pkey PRIMARY KEY (id);


--
-- Name: collections collections_user_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collections
    ADD CONSTRAINT collections_user_slug UNIQUE (user_id, slug);


--
-- Name: data_connectors_documents data_connectors_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_connectors_documents
    ADD CONSTRAINT data_connectors_documents_pkey PRIMARY KEY (document_id, data_connector_user_id, data_connector_name);


--
-- Name: data_connectors data_connectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_connectors
    ADD CONSTRAINT data_connectors_pkey PRIMARY KEY (user_id, name);


--
-- Name: document_aliases document_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_aliases
    ADD CONSTRAINT document_aliases_pkey PRIMARY KEY (user_id, slug);


--
-- Name: document_comments document_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_comments
    ADD CONSTRAINT document_comments_pkey PRIMARY KEY (id);


--
-- Name: document_events document_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_events
    ADD CONSTRAINT document_events_pkey PRIMARY KEY (id, version);


--
-- Name: document_merges document_merges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_merges
    ADD CONSTRAINT document_merges_pkey PRIMARY KEY (to_id, to_end_version);


--
-- Name: document_presence document_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_presence
    ADD CONSTRAINT document_presence_pkey PRIMARY KEY (client_id);


--
-- Name: document_publishes document_publishes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_publishes
    ADD CONSTRAINT document_publishes_pkey PRIMARY KEY (id, version);


--
-- Name: document_suggestions document_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_suggestions
    ADD CONSTRAINT document_suggestions_pkey PRIMARY KEY (id);


--
-- Name: document_thumbnails document_thumbnails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_thumbnails
    ADD CONSTRAINT document_thumbnails_pkey PRIMARY KEY (id, version);


--
-- Name: documents document_user_slug; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT document_user_slug UNIQUE (user_id, slug);


--
-- Name: document_vectors document_vectors_published; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_vectors
    ADD CONSTRAINT document_vectors_published UNIQUE (id, published);


--
-- Name: document_vectors document_vectors_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_vectors
    ADD CONSTRAINT document_vectors_version PRIMARY KEY (id, version);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (name);


--
-- Name: team_invitations team_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id);


--
-- Name: user_email_confirmations user_email_confirmations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_confirmations
    ADD CONSTRAINT user_email_confirmations_pkey PRIMARY KEY (id);


--
-- Name: users user_github_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT user_github_id UNIQUE (github_id);


--
-- Name: users user_google_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT user_google_id UNIQUE (google_id);


--
-- Name: user_likes user_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_likes
    ADD CONSTRAINT user_likes_pkey PRIMARY KEY (id, document_id);


--
-- Name: users user_login; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT user_login UNIQUE (login);


--
-- Name: user_secrets user_secrets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_secrets
    ADD CONSTRAINT user_secrets_pkey PRIMARY KEY (id, name);


--
-- Name: users user_twitter_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT user_twitter_id UNIQUE (twitter_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: collection_documents_id_update_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX collection_documents_id_update_time ON public.collection_documents USING btree (id, update_time);


--
-- Name: document_creator_index; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_creator_index ON public.document_events USING btree (id, type) WHERE (type = 'create'::public.document_event_type);


--
-- Name: document_event_id_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_event_id_time ON public.document_events USING btree (id, "time");


--
-- Name: document_events_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_events_time ON public.document_events USING btree ("time");


--
-- Name: document_events_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_events_user_id ON public.document_events USING btree (user_id);


--
-- Name: document_publish_id_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_publish_id_time ON public.document_publishes USING btree (id, "time");


--
-- Name: document_publish_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_publish_time ON public.documents USING btree (publish_time) WHERE ((publish_time IS NOT NULL) AND (trashed = false));


--
-- Name: document_suggestions_from_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_suggestions_from_id ON public.document_suggestions USING btree (from_id) WHERE (close_time IS NULL);


--
-- Name: document_suggestions_to_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_suggestions_to_id ON public.document_suggestions USING btree (to_id) WHERE (close_time IS NULL);


--
-- Name: document_suggestions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_suggestions_user_id ON public.document_suggestions USING btree (user_id);


--
-- Name: document_thumbnail_unassigned_event_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_thumbnail_unassigned_event_time ON public.document_thumbnails USING btree (event_time) WHERE (assigned = false);


--
-- Name: document_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_user_id ON public.documents USING btree (user_id);


--
-- Name: document_vectors_gin_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_vectors_gin_index ON public.document_vectors USING gin (vector);


--
-- Name: documents_fork_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_fork_id ON public.documents USING btree (fork_id) WHERE (fork_id IS NOT NULL);


--
-- Name: document_comments notify_document_comments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_document_comments AFTER INSERT OR DELETE OR UPDATE ON public.document_comments FOR EACH ROW EXECUTE PROCEDURE public.notify_document_comments();


--
-- Name: document_presence notify_document_presence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER notify_document_presence BEFORE INSERT OR DELETE OR UPDATE ON public.document_presence FOR EACH ROW EXECUTE PROCEDURE public.notify_document_presence();


--
-- Name: document_thumbnails trigger_cancel_document_thumbnails; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_cancel_document_thumbnails BEFORE INSERT ON public.document_thumbnails FOR EACH ROW EXECUTE PROCEDURE public.cancel_document_thumbnails();


--
-- Name: collections trigger_collections_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_collections_id BEFORE INSERT ON public.collections FOR EACH ROW EXECUTE PROCEDURE public.global_id();


--
-- Name: documents trigger_document_alias; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_alias AFTER UPDATE ON public.documents FOR EACH ROW WHEN (((new.slug IS NOT NULL) AND (((old.slug)::text IS DISTINCT FROM (new.slug)::text) OR (old.user_id IS DISTINCT FROM new.user_id)))) EXECUTE PROCEDURE public.insert_document_alias();


--
-- Name: document_comments trigger_document_comments_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_comments_id BEFORE INSERT ON public.document_comments FOR EACH ROW EXECUTE PROCEDURE public.global_id();


--
-- Name: document_publishes trigger_document_disallow_data_connectors; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_disallow_data_connectors BEFORE INSERT ON public.document_publishes FOR EACH ROW EXECUTE PROCEDURE public.disallow_document_data_connectors();


--
-- Name: document_publishes trigger_document_disallow_secrets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_disallow_secrets BEFORE INSERT ON public.document_publishes FOR EACH ROW EXECUTE PROCEDURE public.disallow_document_secrets();


--
-- Name: document_events trigger_document_head; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_head AFTER INSERT ON public.document_events FOR EACH ROW EXECUTE PROCEDURE public.update_document_head();


--
-- Name: documents trigger_document_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_id BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE PROCEDURE public.global_id();


--
-- Name: document_publishes trigger_document_publish; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trigger_document_publish AFTER INSERT ON public.document_publishes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE PROCEDURE public.notify_document_publish();


--
-- Name: document_publishes trigger_document_publish_thumbnail; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_publish_thumbnail BEFORE INSERT ON public.document_publishes FOR EACH ROW EXECUTE PROCEDURE public.insert_document_publish_thumbnail();


--
-- Name: document_publishes trigger_document_publish_time; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_publish_time BEFORE INSERT ON public.document_publishes FOR EACH ROW EXECUTE PROCEDURE public.update_document_publish_time();


--
-- Name: document_suggestions trigger_document_suggestions_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_document_suggestions_id BEFORE INSERT ON public.document_suggestions FOR EACH ROW EXECUTE PROCEDURE public.global_id();


--
-- Name: document_publishes trigger_index_published_document; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trigger_index_published_document AFTER INSERT ON public.document_publishes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE PROCEDURE public.index_published_document();


--
-- Name: team_invitations trigger_team_invitation_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_team_invitation_id BEFORE INSERT ON public.team_invitations FOR EACH ROW EXECUTE PROCEDURE public.global_id();


--
-- Name: user_email_confirmations trigger_user_email_confirmations_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_user_email_confirmations_id BEFORE INSERT ON public.user_email_confirmations FOR EACH ROW EXECUTE PROCEDURE public.global_id();


--
-- Name: users trigger_user_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_user_id BEFORE INSERT ON public.users FOR EACH ROW EXECUTE PROCEDURE public.global_id();


--
-- Name: user_likes trigger_user_like_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_user_like_delete AFTER DELETE ON public.user_likes FOR EACH ROW EXECUTE PROCEDURE public.decrement_document_likes();


--
-- Name: user_likes trigger_user_like_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_user_like_insert AFTER INSERT ON public.user_likes FOR EACH ROW EXECUTE PROCEDURE public.increment_document_likes();


--
-- Name: collection_documents collection_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_documents
    ADD CONSTRAINT collection_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: collection_documents collection_documents_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.collection_documents
    ADD CONSTRAINT collection_documents_id_fkey FOREIGN KEY (id) REFERENCES public.collections(id) ON DELETE CASCADE;


--
-- Name: data_connectors_documents data_connectors_documents_data_connector_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_connectors_documents
    ADD CONSTRAINT data_connectors_documents_data_connector_user_id_fkey FOREIGN KEY (data_connector_user_id) REFERENCES public.users(id);


--
-- Name: data_connectors_documents data_connectors_documents_data_connector_user_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_connectors_documents
    ADD CONSTRAINT data_connectors_documents_data_connector_user_id_fkey1 FOREIGN KEY (data_connector_user_id, data_connector_name) REFERENCES public.data_connectors(user_id, name) ON DELETE CASCADE;


--
-- Name: data_connectors_documents data_connectors_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_connectors_documents
    ADD CONSTRAINT data_connectors_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: data_connectors data_connectors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_connectors
    ADD CONSTRAINT data_connectors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: document_aliases document_aliases_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_aliases
    ADD CONSTRAINT document_aliases_id_fkey FOREIGN KEY (id) REFERENCES public.documents(id);


--
-- Name: document_aliases document_aliases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_aliases
    ADD CONSTRAINT document_aliases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_comments document_comments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_comments
    ADD CONSTRAINT document_comments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: document_comments document_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_comments
    ADD CONSTRAINT document_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_events document_events_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_events
    ADD CONSTRAINT document_events_id_fkey FOREIGN KEY (id) REFERENCES public.documents(id);


--
-- Name: document_events document_events_original_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_events
    ADD CONSTRAINT document_events_original_document_id_fkey FOREIGN KEY (original_document_id) REFERENCES public.documents(id);


--
-- Name: document_events document_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_events
    ADD CONSTRAINT document_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_merges document_merges_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_merges
    ADD CONSTRAINT document_merges_from_id_fkey FOREIGN KEY (from_id) REFERENCES public.documents(id);


--
-- Name: document_merges document_merges_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_merges
    ADD CONSTRAINT document_merges_to_id_fkey FOREIGN KEY (to_id) REFERENCES public.documents(id);


--
-- Name: document_merges document_merges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_merges
    ADD CONSTRAINT document_merges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_presence document_presence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_presence
    ADD CONSTRAINT document_presence_id_fkey FOREIGN KEY (id) REFERENCES public.documents(id);


--
-- Name: document_presence document_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_presence
    ADD CONSTRAINT document_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_publishes document_publishes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_publishes
    ADD CONSTRAINT document_publishes_id_fkey FOREIGN KEY (id) REFERENCES public.documents(id);


--
-- Name: document_publishes document_publishes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_publishes
    ADD CONSTRAINT document_publishes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_suggestions document_suggestions_closer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_suggestions
    ADD CONSTRAINT document_suggestions_closer_id_fkey FOREIGN KEY (closer_id) REFERENCES public.users(id);


--
-- Name: document_suggestions document_suggestions_from_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_suggestions
    ADD CONSTRAINT document_suggestions_from_id_fkey FOREIGN KEY (from_id) REFERENCES public.documents(id);


--
-- Name: document_suggestions document_suggestions_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_suggestions
    ADD CONSTRAINT document_suggestions_to_id_fkey FOREIGN KEY (to_id) REFERENCES public.documents(id);


--
-- Name: document_suggestions document_suggestions_to_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_suggestions
    ADD CONSTRAINT document_suggestions_to_id_fkey1 FOREIGN KEY (to_id, to_merge_end_version) REFERENCES public.document_merges(to_id, to_end_version);


--
-- Name: document_suggestions document_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_suggestions
    ADD CONSTRAINT document_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: document_thumbnails document_thumbnails_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_thumbnails
    ADD CONSTRAINT document_thumbnails_id_fkey FOREIGN KEY (id) REFERENCES public.documents(id);


--
-- Name: document_vectors document_vectors_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_vectors
    ADD CONSTRAINT document_vectors_id_fkey FOREIGN KEY (id) REFERENCES public.documents(id);


--
-- Name: documents documents_fork_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_fork_id_fkey FOREIGN KEY (fork_id) REFERENCES public.documents(id);


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: team_invitations team_invitations_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: team_invitations team_invitations_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_invitations
    ADD CONSTRAINT team_invitations_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.users(id);


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.users(id);


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_email_confirmations user_email_confirmations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_confirmations
    ADD CONSTRAINT user_email_confirmations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_likes user_likes_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_likes
    ADD CONSTRAINT user_likes_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id);


--
-- Name: user_likes user_likes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_likes
    ADD CONSTRAINT user_likes_id_fkey FOREIGN KEY (id) REFERENCES public.users(id);


--
-- Name: user_secrets user_secrets_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_secrets
    ADD CONSTRAINT user_secrets_id_fkey FOREIGN KEY (id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--


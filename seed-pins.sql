-- SEED PINs (idempotente): garante pgcrypto + pin_hash dos colaboradores.
-- So preenche onde pin_hash IS NULL (nao sobrescreve PIN ja trocado).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SET search_path TO khardela, public;
ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS pin_changed_at TIMESTAMPTZ;
ALTER TABLE rbac_contacts ADD COLUMN IF NOT EXISTS pin_must_change BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE rbac_contacts SET pin_hash=crypt('248165', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='tassiano' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('730942', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='eva' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('156307', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='thiago' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('482519', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='sophia' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('691204', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='dany' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('357816', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='cristina' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('925148', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='evandro' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('408273', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='maria' AND pin_hash IS NULL;
UPDATE rbac_contacts SET pin_hash=crypt('561039', gen_salt('bf',8)), pin_changed_at=NOW() WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='geane' AND pin_hash IS NULL;

-- Perfis (idempotente): Thiago = Chefe de Cozinha + Gestor; Eva = Gestora.
UPDATE rbac_contacts SET perfis_adicionais = array_append(COALESCE(perfis_adicionais,'{}'),'GESTOR')
  WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='thiago' AND NOT ('GESTOR' = ANY(COALESCE(perfis_adicionais,'{}')));
UPDATE rbac_contacts SET perfil_principal='GESTOR'
  WHERE tenant_id='khardela:premiumpizzas:sjrp' AND LOWER(apelido_login)='eva' AND perfil_principal <> 'GESTOR';

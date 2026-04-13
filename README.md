# Planning SI — Soins Intensifs

Application de gestion des gardes et désiderata pour service de soins intensifs.

## Stack
- Next.js 14
- Supabase (base de données)
- Vercel (hébergement)

## Variables d'environnement requises sur Vercel

```
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre-clé-anon
```

## Fonctionnalités
- Connexion par code d'accès personnel
- Vue admin : calendrier complet, génération automatique, statistiques
- Vue médecin : saisie des disponibilités uniquement (pas d'accès aux autres)
- Règles : max 5 jours indisponibles/semaine, max 4 jours WE indisponibles/mois
- Génération automatique sans 2 nuits consécutives pour le même médecin

# Deploy Fix for Task #37

**Änderungen:**
1. ✅ Conversation Duplikate in Sidebar behoben
2. ✅ Error-Handling beim Chat-Laden verbessert

## Dateien geändert:
- `src/lib/server/db.ts` - Duplikat-Cleanup + Filter
- `src/lib/stores/chat.ts` - Error-State Handling

## Deploy auf Lincstation:

```bash
# 1. Code kopieren
scp -r /config/.openclaw/workspace/projects/donki-chat root@192.168.0.155:/mnt/user/appdata/donki-chat/

# 2. Rebuild + Restart Container
ssh root@192.168.0.155 'cd /mnt/user/appdata/donki-chat && \
  docker build -t donki-chat:latest . && \
  docker stop donki-chat && \
  docker rm donki-chat && \
  docker run -d --name donki-chat \
    -p 3002:3000 \
    -v /mnt/user/appdata/donki-chat/data:/app/data \
    --restart unless-stopped \
    donki-chat:latest'
```

## Was passiert beim nächsten Start:
- `cleanupOldConversations()` löscht automatisch alle Duplikate
- `getAllConversations()` zeigt nur noch Agent-Conversations
- Sidebar sollte sauber sein mit genau 5 Einträgen (Donki, Nabu, Forge, Claude, Archie)

## Test:
1. Öffne https://chat.opendonki.de
2. Sidebar sollte nur 5 Team-Member zeigen (keine Duplikate)
3. Keine "Fehler beim Laden" Messages mehr (außer bei echten Errors)
4. Agent-Wechsel sollte smooth funktionieren

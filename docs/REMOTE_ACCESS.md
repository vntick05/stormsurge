# Remote Access

Machine LAN IP:

- `192.168.1.236`

SSH:

```bash
ssh admin@192.168.1.236
```

Project workspace after login:

```bash
cd /home/admin/perfect-rfp-trt
```

If you want to start from the project root in one command:

```bash
ssh admin@192.168.1.236 'cd /home/admin/perfect-rfp-trt && exec bash -l'
```

## Browser URLs from your laptop

- Open WebUI: `http://192.168.1.236:3000`
- Portainer: `http://192.168.1.236:9000`
- MinIO Console: `http://192.168.1.236:9001`
- Qdrant Dashboard: `http://192.168.1.236:6333/dashboard`
- Tika: `http://192.168.1.236:9998/tika`
- Document Service Health: `http://192.168.1.236:8081/healthz`

## Suggested SSH config on the laptop

Add this to `~/.ssh/config` on the laptop:

```sshconfig
Host perfect-rfp
  HostName 192.168.1.236
  User admin
```

Then connect with:

```bash
ssh perfect-rfp
```

## Resume Work

After SSH login:

```bash
cd /home/admin/perfect-rfp-trt
git status
docker ps
```

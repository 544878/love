# 阿里云部署

本项目适合部署到阿里云轻量应用服务器或 ECS Linux 实例。生产拓扑为：

```text
浏览器 -> HTTPS 443 -> Nginx -> 127.0.0.1:3000 -> LoveLog Node 服务
```

## 服务器准备

1. 安装当前 Node.js LTS 与 Nginx。
2. 仅对公网放行 SSH、HTTP、HTTPS 所需端口。Node 服务默认只监听 `127.0.0.1:3000`，不要向公网开放 3000。
3. 将项目放到 `/opt/lovelog`，执行 `npm ci` 和 `npm run build`。
4. 创建专用系统用户 `lovelog` 与数据目录 `/var/lib/lovelog`。
5. 在 `/etc/lovelog/lovelog.env` 设置至少 32 位随机 `LOVELOG_JWT_SECRET`，并限制文件读取权限。
6. 参考 `deploy/lovelog.service.example` 注册 systemd 服务。
7. 参考 `deploy/nginx.conf.example` 配置域名、HTTPS 证书和反向代理。

前端生产构建使用：

```text
VITE_CLOUD_API_URL=/api
```

## 数据与备份

`LOVELOG_DATA_FILE` 包含账号密码哈希、共享空间、同步记录和照片。请使用阿里云快照或独立备份策略定期备份，恢复时保持文件所有者为 `lovelog`。

## 上线检查

```bash
curl https://love.example.com/api/health
systemctl status lovelog
nginx -t
```

健康检查应返回 `{"ok":true}`。完成首批账号创建后，可设置 `LOVELOG_ALLOW_REGISTRATION=false` 并重启服务。

## 官方参考

- 轻量应用服务器：https://help.aliyun.com/zh/simple-application-server/
- 管理防火墙：https://help.aliyun.com/zh/simple-application-server/user-guide/manage-the-firewall-of-a-server
- 设置 HTTPS：https://help.aliyun.com/zh/simple-application-server/user-guide/quickly-configure-https
- ECS 常用端口：https://help.aliyun.com/zh/ecs/user-guide/common-ports

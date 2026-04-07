# Vercel 部署步骤

## 1. 推送到 Git 仓库

```bash
git init
git add .
git commit -m "Prepare for Vercel deployment"
git remote add origin <your-repo-url>
git push -u origin main
```

## 2. 在 Vercel 部署

1. 登录 [vercel.com](https://vercel.com)
2. 点击 **Add New Project**
3. 导入 Git 仓库
4. 配置项目（默认即可）
5. 点击 **Deploy**

## 3. 绑定域名

1. Vercel → Settings → Domains
2. 添加 `jy.poweraibase.com`
3. 在 DNS 服务商添加 CNAME 记录：
   ```
   类型：CNAME
   主机：jy
   值：cname.vercel-dns.com
   ```
4. 等待 DNS 生效后访问 `https://jy.poweraibase.com`

## 4. 本地测试生产构建

```bash
npm run build
npx vercel dev
```

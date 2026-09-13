import { auth } from "../lib/auth";
const [email, password, name = "内部用户"] = process.argv.slice(2);
if (!email || !password) { console.error("用法: npm run db:seed -- user@example.com password [name]"); process.exit(1); }
await auth.api.signUpEmail({ body: { email, password, name } });
console.log(`已创建内部账号：${email}`);
process.exit(0);

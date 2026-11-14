// Experiment adapter, not a new Agent runtime. Uses the installed official MCP SDK.
const {McpServer} = require('../../node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js');
const {StdioServerTransport} = require('../../node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
const {z} = require('../../node_modules/zod');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const child = spawn(path.resolve(__dirname, '../../.venv/Scripts/python.exe'),
  ['-X', 'utf8', '-u', path.join(__dirname, 'bridge.py'), root], {windowsHide:true, stdio:['pipe','pipe','inherit']});
let counter=0;const pending=new Map();
createInterface({input:child.stdout}).on('line', line=>{const value=JSON.parse(line); const p=pending.get(value.id);if(p){pending.delete(value.id);p.resolve(value.result);}});
child.on('exit',()=>{for(const p of pending.values())p.reject(new Error('business bridge exited'));pending.clear();});
const invoke=(name,args)=>new Promise((resolve,reject)=>{const id=String(++counter);pending.set(id,{resolve,reject});child.stdin.write(JSON.stringify({id,name,args})+'\n');});
const server=new McpServer({name:'jinxue-a1-synthetic',version:'0.1.0'});
const definitions={
  search_student_history:{query:z.string().max(100).optional(),offset:z.number().int().min(0).optional()},
  read_assignment:{assignment_id:z.string(),number:z.string().optional()},
  read_assignment_image:{assignment_id:z.string(),sha256:z.string()},
  save_pending_note:{request_id:z.string().min(1).max(100),markdown:z.string().min(1).max(20000)},
  read_pending_note:{note_id:z.string()},
};
for(const [name,inputSchema] of Object.entries(definitions))server.registerTool(name,{
  description:'A1合成验证：固定学生A数学；'+name+'；不能切换学生/学科，无任意路径或SQL。',inputSchema,
  annotations:{readOnlyHint:name!=='save_pending_note',destructiveHint:false,openWorldHint:false}
},args=>invoke(name,args));
server.connect(new StdioServerTransport());
process.stdin.on('end',()=>child.kill());

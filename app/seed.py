from files import save_document
from pathlib import Path


def seed_paper(store):
    existing = [p for p in store.bootstrap()['papers'] if p['batch_id'] == 'SYN-LOCAL-001' and p['student_ref'] == 'SYN-01']
    if existing: return existing[0]
    image = Path(__file__).parent / 'web/assets/synthetic-homework.png'
    docs = [save_document(store.root, '合成作业样例.png', image.read_bytes())] if image.is_file() else []
    return store.create_paper(dict(batch_id='SYN-LOCAL-001', title='合成数学作业 · 四题示例', student_ref='SYN-01', student_name='虚构学生01', documents=docs, questions=[
        dict(id='Q01', stem='求抛物线 y=−(x−2)²+3 的顶点坐标与对称轴。', answer='顶点 (−2,3)，对称轴 x=−2', correct_answer='顶点 (2,3)，对称轴 x=2', result='INCORRECT', knowledge='二次函数 · 顶点式', cause='待核实：可能混淆括号内的符号'),
        dict(id='Q02', stem='解方程 x²−5x+6=0。', answer='(x−2)(x−3)=0，x=2 或 x=3', correct_answer='x=2 或 x=3', result='CORRECT', knowledge='一元二次方程', cause=''),
        dict(id='Q03', stem='化简 (x²−1)/(x−1)，并写出 x 的取值限制。', answer='(x−1)(x+1)/(x−1)=x+1', correct_answer='x+1，且 x≠1', result='PARTIAL', knowledge='分式 · 取值限制', cause='待核实：未见写出取值限制；部分正确仅为合成试判口径'),
        dict(id='Q04', stem='数据 6、8、10、12 的平均数是多少？', answer='(6+8+10+12)/4=36/4=8', correct_answer='9', result='INCORRECT', knowledge='统计 · 平均数', cause='待核实：最后一步除法结果有误')]))

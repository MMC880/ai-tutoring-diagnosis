"""Small, explicit teaching fixture; other topics need teacher/Agent supplied content."""
from fractions import Fraction


def vertex_feedback():
    # Exact arithmetic checks the examples; no approximate point samples as proof.
    roots = (Fraction(3), Fraction(1))
    assert all(-(x*x) + 6*x - 5 == 3 for x in (Fraction(2), Fraction(4)))
    assert all((x-2)**2-1 == 0 for x in roots)
    return {
        'origin': '自编流程演示样例（非原试卷标准答案）；分数精确运算检查关键等式，完整推导见教师答案，仍须审核适配性',
        'explanation': '顶点式 y=a(x-h)²+k 中，括号取零时 x=h，顶点为(h,k)，对称轴x=h。不要直接把括号里看到的符号照抄为顶点横坐标。先不看答案，用自己的话解释为什么括号要取零，再独立练习。',
        'levels': [
            {'level': 'A', 'title': '基础巩固', 'question': '求 y=(x+1)²-4 的顶点和对称轴。',
             'solution': 'x+1=0，得x=-1，此时y=-4。顶点(-1,-4)，对称轴x=-1。'},
            {'level': 'B', 'title': '综合运用', 'question': '求 y=(x-2)²-1 的顶点、对称轴及与x轴交点。',
             'solution': '括号取零x=2，顶点(2,-1)，对称轴x=2。令y=0，(x-2)²=1，x-2=±1，x=1或3；交点(1,0)、(3,0)。'},
            {'level': 'C', 'title': '迁移挑战', 'question': '求 y=-x²+6x-5 的最大值，并求 y≥3 时x的取值范围。',
             'solution': '配方y=-(x-3)²+4。平方非负，x=3时最大值4。y≥3等价于(x-3)²≤1，故-1≤x-3≤1，2≤x≤4。'}],
        'review_advice': '先选A档一题独立完成；若稳定再考虑B/C。不一次发三套。几天后用新题延迟复测，具体时间由老师确定。'}

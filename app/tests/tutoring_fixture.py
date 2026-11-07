"""Trusted self-authored math examples; not actual model output or teaching evidence."""
def candidate_result():
    return {'lesson':{
        'original_explanation':'令x-2=0得x=2，此时y=3，因此顶点(2,3)，对称轴x=2。',
        'review':'先请学生说明为何写-2；可能是抄写或符号理解，原因仍待核实。',
        'knowledge_summary':'顶点式y=a(x-h)²+k的顶点为(h,k)，对称轴为x=h。',
        'solution_model':'先令括号为零，再读取纵坐标，最后代入对称位置验算。',
        'variants':'区分直接读顶点、求交点以及展开式配方，按实际卡点选择。',
        'transfer':'让学生解释每一步的依据，再独立完成新题，稍后复测；一次正确不判掌握。'},
        'exercises':[
            {'level':'基础巩固','stem':'求y=2(x+3)²-5的顶点及对称轴。','answer':'教师核对答案：顶点(-3,-5)，对称轴x=-3。','explanation':'令x+3=0，得横坐标-3；此时y=-5。'},
            {'level':'综合运用','stem':'求y=(x-1)²-4的顶点、对称轴及与x轴交点。','answer':'教师核对答案：顶点(1,-4)，轴x=1，交点(-1,0)、(3,0)。','explanation':'顶点式读数，再令y=0得到(x-1)²=4。'},
            {'level':'迁移挑战','stem':'求y=-x²+8x-12的最大值，并求y≥3时x的范围。','answer':'教师核对答案：最大值4，在x=4取得；3≤x≤5。','explanation':'配方为y=-(x-4)²+4，y≥3等价于(x-4)²≤1。'}]}

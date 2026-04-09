"""
RAG Recall Evaluation Script using ragas.

Evaluates the recall rate of the CodeWeaver RAG knowledge base system
by calling the Next.js API endpoints — the same endpoints the chat page
uses — ensuring the test reflects real user experience.

Pipeline: /api/vector-search → /api/system-prompt → /api/chat (eval mode)

Usage:
    pnpm run eval:recall
"""

import asyncio
import json
import os
import sys
import requests

from ragas import EvaluationDataset, evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics import (
    LLMContextRecall,
    ContextPrecision,
    ResponseRelevancy,
    Faithfulness,
)
from langchain_ollama import OllamaEmbeddings
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Load .env.local from the project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"))

# Next.js server URL — the script calls the same APIs the chat page uses
NEXTJS_BASE_URL = os.environ.get("NEXTJS_BASE_URL", "http://localhost:3000")

# Ollama embedding model for ragas metric evaluation (not for the RAG pipeline)
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
EMBEDDING_MODEL = "bge-m3:latest"

# External LLM for ragas metric scoring (better quality than local models)
ZHIPU_API_KEY = os.environ.get("ZHIPU_API_KEY", "")
ZHIPU_BASE_URL = os.environ.get("ZHIPU_BASE_URL", "")
ZHIPU_MODEL_NAME = os.environ.get("ZHIPU_MODEL_NAME", "")

TOP_K = 5  # number of chunks to retrieve per query

# ---------------------------------------------------------------------------
# Golden Dataset — derived from 张三.txt
# ---------------------------------------------------------------------------
GOLDEN_DATASET = [  
    {  
        "user_input": "易飒小时候在车里遇到危险时是怎么躲藏的？",  
        "reference": "易飒拽过爸爸的一件黑色大棉袄，把自己整个儿罩住，然后安静地、蜷缩着、躺了下去，藏在车座下面。",  
        "reference_contexts": [  
            "囡囡咽了口唾沫，紧张地挪着屁股，慢慢下了车座。她动作很轻地拽过边上爸爸的一件黑色大棉袄，把自己整个儿罩住，然后安静地、蜷缩着、躺了下去。",  
        ],  
    },  
    {  
        "user_input": "宗杭的父亲叫什么名字？他是做什么的？",  
        "reference": "宗杭的父亲叫宗必胜，是个小老板，在柬埔寨暹粒与人合资开了吴哥大酒店。",  
        "reference_contexts": [  
            "他爹宗必胜看到他发的那条朋友圈，会是什么反应。",  
            "宗必胜在家吃香喝辣的，这叔……这大包小包的架势，出国打工的吧。",  
        ],  
    },  
    {  
        "user_input": "宗杭为什么被送到柬埔寨暹粒？",  
        "reference": "宗杭嫌打工太累，自作主张辞了工作，向父亲宗必胜提出能不能在家里公司找个轻松的活。宗必胜很生气，让他去暹粒的酒店当实习生（TRAINEE），算是变相流放。",  
        "reference_contexts": [  
            "宗必胜做人真绝，两天后通知他，让他去暹粒的酒店帮忙，职位叫TRAINEE（实习生）。",  
            "不过是他嫌打工太累，自作主张辞了工作，然后委婉地向宗必胜提说能不能在家里的公司给他找个钱多事少的活。",  
        ],  
    },  
    {  
        "user_input": "龙宋是谁？他和宗杭是什么关系？",  
        "reference": "龙宋是宗杭在柬埔寨的门拖（mentor，导师），负责在当地照顾和指导宗杭。他是吴哥大酒店的负责人，也是宗必胜信任的合伙人。",  
        "reference_contexts": [  
            "这就是他的门拖，龙宋。",  
            "龙宋让他妥了之后就朝机场出口走，说是有人在那接，接机牌非常显眼，绝对不会错过。",  
        ],  
    },  
    {  
        "user_input": "宗杭在暹粒老市场第一次被打是怎么回事？",  
        "reference": "马老头（马跃飞）在老市场被两个柬埔寨人追赶时，把宗杭当作儿子喊，让他去报警。宗杭被误认为是马老头的同伙，逃跑时不小心用废料板材砸伤了一个追赶者，之后被两个柬埔寨人暴打。",  
        "reference_contexts": [  
            "马老头突然朝那人扑了过去。他拼尽所有力气，死死抱住那人的腿，转头朝着宗杭离开的方向声嘶力竭大叫：\u201c儿子！快跑！快去报警！\u201d",  
            "宗杭叫苦不迭，别看他人高腿长，但素来没锻炼底子，眼见就要被人撵上",  
        ],  
    },  
    {  
        "user_input": "易飒的突突车酒吧是怎么经营的？",  
        "reference": "易飒在老市场区有一辆突突车酒吧，但她不亲自管理，而是包租给别人，按月收租金。她的包租业务遍布湄公河流域多个国家。",  
        "reference_contexts": [  
            "突突车酒吧确实是她的，但她不管，包租给别人，按月收租金。听人说，她不但包租突突车，还包租了条小游船",  
            "据说，溯着湄公河而上至老挝，而下至越南，遍布她的包租业务",  
        ],  
    },  
    {  
        "user_input": "什么是水鬼三姓？他们分别沿哪条河居住？",  
        "reference": "水鬼三姓指的是丁、姜、易三个姓氏的家族。丁姓沿黄河而居，姜姓住在长江流域，易姓沿澜沧江-湄公河而下。他们拥有在水下存活的天赋。",  
        "reference_contexts": [  
            "他们自然而然，以河为分，丁姓沿黄河而居，姜姓住地不离长江流域，易姓也一样，顺着\u2018澜沧江-湄公河\u2019而下，有水的地方，就有他们。",  
        ],  
    },  
    {  
        "user_input": "水鬼三姓的主业是什么？",  
        "reference": "水鬼三姓的主业是帮人在水下藏东西（托管），每一单都价值巨大。存期少则几十年，长可几百年。他们收取三成的费用，到期不来则加到五成，十年再不来则全部归三姓所有。",  
        "reference_contexts": [  
            "主业是帮人在水下藏东西，或者叫托管，每一单都价值巨大，毕竟如果只是一两箱金银，也不值得费这个事。存期少则几十年，长可几百年，随客户的心意。",  
            "我们只收钱，不付钱！管你金山银山，想托我管，分出三成。",  
        ],  
    },  
    {  
        "user_input": "什么是金汤谱？开金汤是什么意思？",  
        "reference": "金汤谱是水鬼三姓记录藏宝地点的册子。'金汤'指藏东西的地方，因为那些地方值钱、金光宝气。'开金汤'就是去把之前藏在水下的宝贝取出来。三姓的金汤合起来就是一本金汤谱，水鬼要记得滚瓜烂熟。",  
        "reference_contexts": [  
            "行话里，我们把藏东西的地方叫\u2018金汤\u2019，因为同样是水，这一处值钱，金光宝气的，三姓的\u2018金汤\u2019合起来，就是一本金汤谱，做水鬼的，要记得滚瓜烂熟。",  
        ],  
    },  
    {  
        "user_input": "易飒和易萧是什么关系？她们的名字有什么来历？",  
        "reference": "易飒和易萧是亲姐妹，易萧是姐姐，易飒是妹妹。她们的父亲易九戈喜欢屈原的《九歌》，取自'风飒飒兮木萧萧'这句诗。原本按先后顺序，'飒'字应给姐姐，'萧'字给妹妹。",  
        "reference_contexts": [  
            "我父亲喜欢看屈原的《九歌》，里头有一句，叫\u2018风飒飒兮木萧萧\u2019，他就给我取名叫易萧。",  
            "不过他后来说，这名字取错了，早知道我成年以后还会多个妹妹，应该按照先后顺序，\u2018飒\u2019字给我，\u2018萧\u2019字给她。",  
        ],  
    },  
    {  
        "user_input": "1996年三江源发生了什么事？",  
        "reference": "1996年，水鬼三姓因为金汤连续翻锅，倾巢出动前往三江源寻找漂移地窟。易家车队找到了那个洞并进入了漂移地窟，结果发生了严重事故，大量人员死亡或异变。易飒的父亲易九戈和姐姐易萧都在这次事故中出事。",  
        "reference_contexts": [  
            "赶到的时候，灾难已经发生了，简直是个修罗场，遍地死人，没死的也血肉模糊，在地上乱爬",  
            "三姓为之雀跃，兴师动众之下，好手几乎倾巢而出，甚至有携家带口的，谁也不想错过这种千年都难遇的\u201c盛事\u201d。",  
        ],  
    },  
    {  
        "user_input": "丁碛是什么身份？他和丁长盛是什么关系？",  
        "reference": "丁碛是丁长盛的干儿子（养子），是丁长盛大冬天在黄河边上捡到的弃婴。他是个'绝户'——自愿不婚不生育，才被允许冠丁姓、学丁家本事。他在掌事会做事，负责处理各种脏活。",  
        "reference_contexts": [  
            "据说，这是个没爹没娘的野孩子，是丁长盛大冬天在距离碛口镇不远处的黄河边上捡到的",  
            "丁碛是捡来的，捡来的，就不能姓丁，不能学丁家的本事，也不能接近丁家的秘密。除非他自愿绝户，这辈子孑然一身",  
        ],  
    },  
    {  
        "user_input": "什么是养尸囦？",  
        "reference": "养尸囦是水里的养尸地，'囦'（yuān）字音义通'渊'，寓意'水中之水'，古本义是'打漩涡的水'。养尸囦是水底深处封闭的'水团'，可以让沉进来的尸体不腐，而且能不受鱼类等活物侵扰。鱼遇到养尸囦会掉头或绕过去，所以养尸囦又叫'鱼不去'。",  
        "reference_contexts": [  
            "养尸囦，其实就是水里的养尸地，\u201c囦\u201d（yuān）字，音义都通\u201c渊\u201d，寓意\u201c水中之水\u201d，古本义是\u201c打漩涡的水\u201d。",  
            "养尸囦比养尸地的要求高：不但要保证沉进来的尸体不腐，还得能够不受鱼类等活物侵扰。所以养尸囦另有个诨号，叫\u201c鱼不去\u201d。",  
        ],  
    },  
    {  
        "user_input": "井袖是什么人？她和宗杭怎么认识的？",  
        "reference": "井袖是一名按摩师，原先在昆明工作，后来跟男朋友去了柬埔寨。她住在吴哥大酒店时，跟隔壁房间的宗杭在露台上聊天认识。井袖性格率真，偶尔会跟自己心动的客人交往。",  
        "reference_contexts": [  
            "井袖说，她原先在昆明当按摩师，男朋友先来的柬埔寨，把这吹得多么多么好",  
            "井袖。不是，古井的井，原先叫井秀，秀气的秀，我嫌太土，改水袖的袖了。",  
        ],  
    },  
    {  
        "user_input": "宗杭被素猜的人绑架后是怎么被救出来的？",  
        "reference": "宗杭在浮村被素猜的手下蛋仔绑架后，在一次被押送经过陈秃的船屋时，跳入水中呼救。易飒当时正在船屋上，虽然一度犹豫，但最终从水下救了宗杭——她使用水耙挂在渔船底部，等到蛋仔把宗杭沉湖后，从水底将他救出。",  
        "reference_contexts": [  
            "他腾一下站起来，大吼：\u201c易飒！我认识你！是我！\u201d与此同时，再无犹疑，拼尽浑身的力气，猛地跃进水中。",  
            "易飒慢慢沉入水中。",  
        ],  
    },  
    {  
        "user_input": "陈秃在浮村是做什么的？",  
        "reference": "陈秃在浮村开了个'诊所'，实际上更像个搞药品批发的黑超市，售卖各种医疗用品和药品。他也算是华人社群的领头羊，他的船屋被当作华人地标。他还养了两条暹罗鳄。",  
        "reference_contexts": [  
            "这个社区\u201c诊所\u201d，更像个搞药品批发的黑超市，中间一张带抽屉的破办公桌，靠墙那几面都是货架",  
            "陈禾几，就是拆字的陈秃，这名是他自己起的",  
        ],  
    },  
    {  
        "user_input": "乌鬼是什么？易飒的乌鬼有什么特点？",  
        "reference": "乌鬼就是鱼鹰（鸬鹚），杜甫有诗说'家家养乌鬼，顿顿食黄鱼'。易飒的乌鬼体长将近一米，浓黑羽毛泛金属色冷光，嘴巴金黄色，眼睛是绿莹莹的。水鬼三姓精心饲养乌鬼，还有意识地锻炼其酒量，因为醉了的乌鬼可以离魂，能看到人看不见的东西。",  
        "reference_contexts": [  
            "鱼鹰，也就是俗称的鸬鹚，中国古代也称它\u201c乌鬼\u201d，杜甫有句诗说\u201c家家养乌鬼，顿顿食黄鱼\u201d",  
            "水鬼三姓精心饲养乌鬼，且有意识地锻炼乌鬼的酒量，是因为他们认定：喝得越多、醉得越厉害的乌鬼，可以离魂",  
        ],  
    },  
    {  
        "user_input": "鄱阳湖老爷庙水域为什么被称为'东方百慕大'？",  
        "reference": "老爷庙水域近五六十年沉了100多艘船，包括1945年日本神户丸号。那里因为狭管效应（庐山挡风收窄）导致容易出现大风大浪，加上湖底有条巨大沙坝造成水下乱流和漩涡。更诡异的是，湖底找不到任何沉船残骸。",  
        "reference_contexts": [  
            "后来发现，那块地方很不简单，不止神户丸号栽了，近五六十年，沉了100多艘船",  
            "更诡异的是，那里水不算太深，三四十米，沉这么多艘船，搁在别处怕是都能填平了，但是！那片水底下，没有找到过船！",  
        ],  
    },  
    {  
        "user_input": "丁玉蝶是什么样的人？",  
        "reference": "丁玉蝶是丁家最年轻的水鬼，自称'无性恋'，不喜欢男人也不喜欢女人。他喜欢留道士头发型，发揪上插一只穿花蝶（金箔和点翠红宝石制成的蝴蝶）。他性格自恋孤僻，网名叫'穿花蝶'，签名是'水葡萄千千万，穿花蝶最好看'。",  
        "reference_contexts": [  
            "这是丁家最年轻的水鬼，算是跟她同届的，丁玉蝶。",  
            "他发现自己还不是同性恋。他不喜欢男人，也不喜欢女人。他向易飒宣称自己是\u201c无性恋\u201d",  
        ],  
    },  
    {  
        "user_input": "易飒的脚踝上纹了什么纹身？有什么含义？",  
        "reference": "易飒的右脚脚踝上纹了'去死'两个字，是瘦金体。她解释说：所有人从出生那一刻开始，都在一步一步走向死亡，一步一个'去死'很正常，停下来了才糟糕。",  
        "reference_contexts": [  
            "右脚白皙细致的脚踝上刺中文刺青，两个字，竖列，细长纤弱的瘦金体，简单、干净、直白、粗暴。去死。",  
            "所有人，从出生那一刻开始，都在一步一步走向死亡，没人例外",  
        ],  
    },  
    {  
        "user_input": "什么是坐水？易飒的坐水能力如何？",  
        "reference": "坐水是水鬼女七试的第一考，比谁在水下待得时间长，取端坐如山之意。易飒在'女七试'中，二十七个女孩沉江后，她是最后一个浮上来的，坐水能力在水鬼三姓中几乎是传奇。",  
        "reference_contexts": [  
            "坐水，是女七试的第一考，通俗点说，就是比谁在水下待得时间长，他们叫\u201c坐水\u201d，取端坐如山之意。",  
            "连收了二十六个，水里只剩了一个易家标。",  
        ],  
    },  
    {  
        "user_input": "易飒每月19号前后会出现什么异常？",  
        "reference": "从每月15号开始，易飒的脾气会渐渐暴躁，到19号会爆发黑色血管——全身凸起扭曲的黑色血管，面目狰狞。她通过注射兽用麻醉剂来控制症状，越心平气和消退越快，一般三四个小时可以消去。",  
        "reference_contexts": [  
            "比如19号只是爆发，其实从月半开始，她的脾气就会渐渐暴躁",  
            "比如爆血管的时长，她越惊慌失措、惶恐不安，黑色的血管就越难消退",  
        ],  
    },  
    {  
        "user_input": "什么是息壤？它有什么特性？",  
        "reference": "息壤是一种能自己生长的物质，'息'代表生长。传说大禹用息壤来治水填洪水。息壤分幼年、壮年、老年三种状态：幼年息壤活性强、会发光、频繁舒展；壮年息壤用于构建息巢保存尸体；老年息壤活性降低后死去变成普通泥沙。息壤怕火。",  
        "reference_contexts": [  
            "息壤。又指顶上泛亮的石灰岩：\u201c息壤。\u201d最后指遍地碎肉壳片，还是那两个字：\u201c息壤。\u201d",  
            "传说里，大禹拿它来治水，洪水泛滥，息壤不断生长，把水给挡住了",  
        ],  
    },  
    {  
        "user_input": "鄱阳湖底的金汤穴里有什么？",  
        "reference": "鄱阳湖底的金汤穴里有一个巨大的船冢（沉船废墟），还有一个息巢——由息壤形成的巨大巢脾结构，像蜂巢一样，每个巢房里都躺着一具保存完好的尸体。息巢里还有一面嵌入祖牌的太极盘（轮回钟）。",  
        "reference_contexts": [  
            "这是个巨大无比的溶洞。她所在的位置是高处一块突出的巨石。而低处，重重叠叠，堆堆团团，都是船只残骸",  
            "从洞顶一路垂下一扇扇巨幅，有点像古代的染坊，晒杆垂下的布匹",  
        ],  
    },  
    {  
        "user_input": "姜骏的真实情况是什么？",  
        "reference": "真正的姜骏在1996年三江源事件中异变了，脑袋畸形增大、身体萎缩，被姜孝广秘密带走保护。之后姜孝广找了个假姜骏替代，骗了三姓二十多年。真姜骏后来被祖牌控制，在鄱阳湖底的息巢中杀死了姜孝广，并试图控制其他人。",  
        "reference_contexts": [  
            "姜孝广带着人，把姜骏匆忙藏到了车上，当时的姜骏，外表已经有变化了，所以后来，鄱阳湖上那一个，人模狗样的，我不看都知道是假的。",  
        ],  
    },  
    {  
        "user_input": "漂移地窟是什么？怎么找到它？",  
        "reference": "漂移地窟是一个位置不固定的地下洞穴，在三江源地区漂移。它的特征是'地开门，风冲星斗'——洞口平开在地面上，里头有强风向上吹出。地窟消失后会在地面留下椭圆形漩痕。三姓通过多年追踪这些漩痕，大致掌握了它的活动轨迹。",  
        "reference_contexts": [  
            "地开门，风冲星斗——洞口应该是平开在地面上，洞里有风，因为只有直上直下、从洞穴深处往上吹出来的风，才有可能\u201c冲星斗\u201d。",  
            "洞一定是存在的，漂走了也正常，本来就叫\u2018漂移\u2019嘛，但地可不是天",  
        ],  
    },  
    {  
        "user_input": "太岁是什么？漂移地窟里的太岁有多大？",  
        "reference": "太岁是一种罕见的黏菌复合体，古代称为'肉灵芝'，形状像肉块，可以自生自长。漂移地窟里的太岁有几层楼高，是巨大的黑褐色肉块，会蠕动，表面有肉丝状纹理和血管凸起，外壳包覆着息壤。它位于漂移地窟深处水底。",  
        "reference_contexts": [  
            "太岁是一种罕见的黏菌复合体，差不多跟地球一样古老",  
            "那是一个个巨大的黑褐色肉块，呼吸般起伏，边侧的水被带得一激一荡——肉块的表面上，有肉丝状的纹理，还密布着类似血管的根根凸起。",  
        ],  
    },  
    {  
        "user_input": "丁盘岭最后在漂移地窟里做了什么？",  
        "reference": "丁盘岭选择留在漂移地窟最高处，将自己浸入祖牌融化形成的液池中，用大脑去干扰和反控制祖牌，以此牵制息壤的攻击，为其他人争取逃生的时间。这是一种以精神力对抗祖牌控制力的自我牺牲行为。",  
        "reference_contexts": [  
            "丁盘岭已经整个儿趴伏着浸入了祖牌融就的池中，也不知道这么浸了多久了。他四肢大展，无声无息，只脑子死死抵住了祖牌的边沿",  
            "那些息壤在动了，但不是攻击，像是有些要攻击，而有些在牵制，互相抗衡着",  
        ],  
    },  
    {  
        "user_input": "丁碛最后是怎么死的？他做了什么？",  
        "reference": "丁碛被已经异变的丁长盛用匕首捅了三刀，身受致命伤。但他拼着最后的力气爬到滑轮吊机前，把吊绳放了下去，在约定的整点时间把绳子往上拽，救出了困在地窟里的众人。他留下了摄像机录像作为遗言，然后死在了吊机旁。",  
        "reference_contexts": [  
            "丁碛笑起来。问那个圆圆的镜头：\u201c是不是没想到，老子临死，还干了一件人事？\u201d",  
            "他还站着，半因绑绳助力，半因肢体僵硬",  
        ],  
    },  
    {  
        "user_input": "祖牌的真正本质是什么？",  
        "reference": "祖牌不是普通的祖宗牌位，而是一种具有精神控制力的特殊生物。它附着在太岁身上，能通过水为媒介控制水鬼的行为和大脑。祖牌与太岁孢子结合后产生不同程度的'水葡萄'，三姓的祖师爷就是最初被嫁接了这种低程度结合物的人。",  
        "reference_contexts": [  
            "祖牌是控制一切的，息壤是可以自行生长的能量物质，傀儡一样接收它的指令。",  
            "祖牌和太岁，就有点像，狼狈为奸中狈的那个感觉",  
        ],  
    },  
    {  
        "user_input": "易飒最后为什么要和宗杭分别？",  
        "reference": "易飒从软面册子中得知，像她这样异变的人活不了太长时间，会经历谵妄、流血、毛发枯萎、指甲脱落，最后身体出现腐臭味后死亡。她不想让宗杭目睹这一切，也不想让他为一段没有未来的感情蹉跎人生。她联系了宗杭的父母来接他，选择独自面对剩余的时光。",  
        "reference_contexts": [  
            "一般有谵妄征兆出现时，死亡就已经提上日程了，再严重一点的是流血",  
            "我不需要任何人陪，也不要人照顾，更不想让你来送这一程，我不愿意人家看到我丑陋破落的样子",  
        ],  
    },  
]  


# ---------------------------------------------------------------------------
# RAG Pipeline — calls the Next.js API endpoints
# (identical to what the chat page uses)
# ---------------------------------------------------------------------------

def vector_search(query: str, knowledge_base_id: int, top_k: int = TOP_K) -> list[dict]:
    """Call the Next.js vector search API (same as chat page)."""
    resp = requests.post(
        f"{NEXTJS_BASE_URL}/api/vector-search",
        json={"query": query, "knowledgeBaseId": knowledge_base_id, "topK": top_k},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["results"]


def build_system_prompt(contexts: list[str]) -> str:
    """Call the Next.js system prompt API (same as chat page)."""
    resp = requests.post(
        f"{NEXTJS_BASE_URL}/api/system-prompt",
        json={"contexts": contexts},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["systemPrompt"]


def generate_answer(query: str, system_prompt: str) -> str:
    """Call the Next.js chat API in eval mode (same model, same prompt)."""
    resp = requests.post(
        f"{NEXTJS_BASE_URL}/api/chat",
        json={
            "messages": [{"role": "user", "content": query}],
            "systemPrompt": system_prompt,
            "mode": "eval",
        },
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()["answer"]


# ---------------------------------------------------------------------------
# Resolve knowledge base ID
# ---------------------------------------------------------------------------

def resolve_knowledge_base_id() -> int:
    """Find the knowledge base that contains the 张三 file via Next.js."""
    # Query the knowledge base list page (server component data)
    # We use the database directly since there's no API for listing knowledge bases
    import psycopg2

    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "5432")
    DB_NAME = os.environ.get("DB_NAME", "knowledge_db")
    DB_USER = os.environ.get("DB_USER", "bbimasheep")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")

    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT kb.id, kb.name
                FROM knowledge_base kb
                JOIN uploaded_files uf ON uf.knowledge_base_id = kb.id
                WHERE uf.filename LIKE '%张三%'
                LIMIT 1
                """
            )
            row = cur.fetchone()
            if row:
                print(f"Found knowledge base: id={row[0]}, name={row[1]}")
                return row[0]
            cur.execute("SELECT id, name FROM knowledge_base ORDER BY id LIMIT 1")
            row = cur.fetchone()
            if row:
                print(f"Using first knowledge base: id={row[0]}, name={row[1]}")
                return row[0]
            print("ERROR: No knowledge base found in the database.")
            print("Please upload 张三.txt to a knowledge base first via the web UI.")
            sys.exit(1)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Main evaluation
# ---------------------------------------------------------------------------

async def run_evaluation():
    print("=" * 60)
    print("  RAG Recall Evaluation (ragas)")
    print("=" * 60)
    print(f"Next.js URL:     {NEXTJS_BASE_URL}")
    print(f"Scoring LLM:     {ZHIPU_MODEL_NAME} (via {ZHIPU_BASE_URL})")
    print(f"Eval Embeddings: {EMBEDDING_MODEL} (local Ollama)")
    print(f"Ollama URL:      {OLLAMA_BASE_URL}")
    print(f"Golden Dataset:  {len(GOLDEN_DATASET)} questions")
    print("=" * 60)
    print()
    print("Pipeline: /api/vector-search -> /api/system-prompt -> /api/chat (eval)")
    print("=" * 60)

    # 1. Resolve knowledge base ID
    kb_id = resolve_knowledge_base_id()

    # 2. Run the RAG pipeline for each question
    #    (same API sequence as the chat page)
    print("\n[1/3] Running RAG pipeline to collect responses...")
    sample_list = []
    for i, item in enumerate(GOLDEN_DATASET):
        question = item["user_input"]
        print(f"  [{i+1}/{len(GOLDEN_DATASET)}] {question}")

        # Step 1: Vector search (same as chat page)
        search_results = vector_search(question, kb_id)
        retrieved_contexts = [r["chunk_text"] for r in search_results]

        # Step 2: Build system prompt (same as chat page)
        system_prompt = ""
        if retrieved_contexts:
            system_prompt = build_system_prompt(retrieved_contexts)

        # Step 3: Generate answer via chat API (same model, same prompt)
        answer = generate_answer(question, system_prompt) if system_prompt else "无法检索到相关上下文。"

        sample_list.append({
            "user_input": question,
            "response": answer,
            "reference": item["reference"],
            "reference_contexts": item["reference_contexts"],
            "retrieved_contexts": retrieved_contexts,
        })

    # 3. Build ragas EvaluationDataset
    print("\n[2/3] Building ragas EvaluationDataset...")
    eval_samples = []
    for s in sample_list:
        eval_samples.append({
            "user_input": s["user_input"],
            "response": s["response"],
            "reference": s["reference"],
            "reference_contexts": s["reference_contexts"],
            "retrieved_contexts": s["retrieved_contexts"],
        })

    dataset = EvaluationDataset.from_list(eval_samples)

    # 4. Configure ragas: external LLM for scoring, local Ollama for embeddings
    print("[3/3] Running ragas evaluation (this may take a while)...\n")

    if not ZHIPU_API_KEY or not ZHIPU_BASE_URL or not ZHIPU_MODEL_NAME:
        print("ERROR: ZHIPU_API_KEY, ZHIPU_BASE_URL, ZHIPU_MODEL_NAME must be set in .env.local")
        sys.exit(1)

    scoring_llm = ChatOpenAI(
        model=ZHIPU_MODEL_NAME,
        api_key=ZHIPU_API_KEY,
        base_url=ZHIPU_BASE_URL,
        temperature=0,
    )
    embeddings = OllamaEmbeddings(
        model=EMBEDDING_MODEL,
        base_url=OLLAMA_BASE_URL,
    )

    ragas_llm = LangchainLLMWrapper(scoring_llm)
    ragas_embeddings = LangchainEmbeddingsWrapper(embeddings)

    metrics = [
        LLMContextRecall(llm=ragas_llm),
        ContextPrecision(llm=ragas_llm),
        ResponseRelevancy(llm=ragas_llm, embeddings=ragas_embeddings),
        Faithfulness(llm=ragas_llm),
    ]

    result = evaluate(
        dataset=dataset,
        metrics=metrics,
    )

    # 5. Print results
    print("\n" + "=" * 60)
    print("  Evaluation Results")
    print("=" * 60)

    # result is a pandas DataFrame
    print(result.to_pandas().to_string(index=False))

    # Print summary averages
    print("\n--- Metric Averages ---")
    df = result.to_pandas()
    for col in df.columns:
        if col not in ("user_input", "response", "reference",
                        "reference_contexts", "retrieved_contexts"):
            try:
                avg = df[col].astype(float).mean()
                print(f"  {col}: {avg:.4f}")
            except (ValueError, TypeError):
                pass

    # Save results to JSON
    output_path = os.path.join(os.path.dirname(__file__), "eval_results.json")
    results_data = []
    for s in sample_list:
        results_data.append({
            "question": s["user_input"],
            "ground_truth": s["reference"],
            "rag_answer": s["response"],
            "retrieved_contexts": s["retrieved_contexts"],
            "reference_contexts": s["reference_contexts"],
        })

    # Add metric averages
    metric_averages = {}
    for col in df.columns:
        if col not in ("user_input", "response", "reference",
                        "reference_contexts", "retrieved_contexts"):
            try:
                metric_averages[col] = round(float(df[col].astype(float).mean()), 4)
            except (ValueError, TypeError):
                pass

    output = {
        "metric_averages": metric_averages,
        "details": results_data,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    asyncio.run(run_evaluation())

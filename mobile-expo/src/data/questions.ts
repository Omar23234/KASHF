export interface OfficialQuestion {
  id: number;
  text: string;
  isGroupPrompt?: boolean;
}

/**
 * Official 63 Egyptian Arabic Question Bank.
 * Preserved verbatim with internal sequential IDs 1..63.
 */
export const OFFICIAL_QUESTIONS: readonly OfficialQuestion[] = [
  { id: 1, text: 'شخص نفسك تشوفه ولي' },
  { id: 2, text: 'اي الحاجه الي انت محتاجها الفتره دي' },
  { id: 3, text: 'اي غلطة عمرك' },
  { id: 4, text: 'اي الحاجة الي شاغله عقلك الفتره دي' },
  { id: 5, text: 'اخر مرة عيط امته واي السبب' },
  { id: 6, text: 'عادة نفسك تتخلص منها' },
  { id: 7, text: 'اي الشعور الي مسيطر عليك الفترة دي' },
  { id: 8, text: 'سلبيات شخصيتك' },
  { id: 9, text: 'اي الفتره الي عديت عليك كانت اصعب فتره عديت عليك و الي حصل فيها و اتعاملت معاها ازاي' },
  { id: 10, text: 'اي الحاجات الي شايف انها تخوفك انك تخش علاقة عاطفية' },
  { id: 11, text: 'امته اخر مره حسيت فيها انك لوحدك و الي حصل ساعتها' },
  { id: 12, text: 'لو قابلت نفسك وانت صغير اي النصيحة الي هتقولها ليه' },
  { id: 13, text: 'لو خيروك بين انك تنسي ماضيك و تكمل حياتك عادى ولا يكون مستقبلك زي ما انت عاوز بس ذكريات الماضي هتفضل موجوده' },
  { id: 14, text: 'اي اول حاجه بتيجي في دماغك لما تقعد مع نفسك' },
  { id: 15, text: 'لو قدامك فرصة تقدر تغير غلطة انت عملتها و ندمان عليها هتبقي اي الغلطة' },
  { id: 16, text: 'اوصف حالتك العاطفية حاليا' },
  { id: 17, text: 'اوصف صوتك الداخلي بيعبر عن اي' },
  { id: 18, text: 'اشرحلي معني الحب من وجهه نظرك' },
  { id: 19, text: 'تقول اي لنسختك الصغيرة' },
  { id: 20, text: 'اي اكتر كلمة بتسمعها بتضايقك ولي' },
  { id: 21, text: 'شايف ان الحب بيتغير بعد الجواز واين كانت الاجابة قولي اي السبب' },
  { id: 22, text: 'شايفك نفسك في انهي شخصية من فيلم او مسلسل شوفته ولي' },
  { id: 23, text: 'اي اكتر حاجه الناس بتفهمها غلط عنك' },
  { id: 24, text: 'لو افتراضا انك رجعت لزمن التسعينات هتقضي يومك ازاي' },
  { id: 25, text: 'اي القرار الي اخدته بطريقة عشوائية و بالصدفة ظبط معاك' },
  { id: 26, text: 'لو بدلنا حياه كل واحد فينا اي الحاجة الي انت شايف ان لو عشتيتها مكانك هتبقي صعبة', isGroupPrompt: true },
  { id: 27, text: 'احكيلنا موقف محرج' },
  { id: 28, text: 'بالنسبة ليك انهي شعور اصعب انك تقع في الحب ولا انك تخرج منه و اشرح السبب' },
  { id: 29, text: 'لو حد عرض عليك صندوق فيه كل شئ فقدته في حياتك اي اول حاجه هتدور عليها' },
  { id: 30, text: 'حاجه بسيطة بس بتخليك مبسوط دايما' },
  { id: 31, text: 'لو افترضنا انك دخلت بيت و فيه كذا اوضه و كل اوضه بتعبر عن مشهد او تجربة انت عيشتها اي الاوضه الي هتهرب منها و اي الاوضه الي هتحب تدخلها و تعيد التجربة و تشوفها' },
  { id: 32, text: 'لو خيروك بين ان اقرب شخص ليك يختفي من حياتك ومتعرفش عنه حاجه ولا تقطعوا مع بعض ب اوسخ طريقة' },
  { id: 33, text: 'خمس حاجات بتفكرك بيا', isGroupPrompt: true },
  { id: 34, text: 'إمتى كانت آخر مرة حسيت فيها إنك مش قادر تتكلم بصعوبة عن حاجة معينة مع شخص بتثق فيه؟' },
  { id: 35, text: 'إيه أجمل ذكرى ليك مع أصحابك من السنة دي؟' },
  { id: 36, text: 'إيه أفضل نصيحة عندك عشان تحافظ على صداقة تستمر لفترة طويلة؟' },
  { id: 37, text: 'إيه المخاوف اللي نفسك تتغلب عليها؟' },
  { id: 38, text: 'إيه أسوأ انفصال عاطفي مريت بيه في حياتك؟' },
  { id: 39, text: 'إمتى كانت آخر مرة فتحت قلبك واتكلمت عن حاجة كانت صعبة عليك و كانت اي الحاجه دي' },
  { id: 40, text: 'إيه اللي بيخلي صعب عليك إنك تفتح قلبك أو تتكلم عن مواضيع صعبة؟' },
  { id: 41, text: 'إزاي بتتعامل مع الانفصال؟ أو إزاي بتقول لشخص إنك عايز تنفصل عنه؟' },
  { id: 42, text: 'إيه حاجة بتعملها ومحدش يتوقع إنك بتحبها؟' },
  { id: 43, text: 'إيه سر صغير عمرك ما قلته لحد من الموجودين؟', isGroupPrompt: true },
  { id: 44, text: 'إيه حاجة بتضايقك من نفسك؟' },
  { id: 45, text: 'إيه أكتر حاجة ممكن تنهي علاقة بالنسبة لك؟' },
  { id: 46, text: 'مين أكتر واحد هنا كنت واخد عنه انطباع غلط؟', isGroupPrompt: true },
  { id: 47, text: 'لو لازم تقضي أسبوع من غير واحد من الموجودين، هتختار مين؟', isGroupPrompt: true },
  { id: 48, text: 'مين هنا تتوقع إنه مخبي حاجات كتير عن شخصيته؟', isGroupPrompt: true },
  { id: 49, text: 'اي اكتر حاجه انا وانت شبه بعض فيها ومفيش اي حد تاني من اصحابك شبهك فيها', isGroupPrompt: true },
  { id: 50, text: 'ايه اكتر حاجه انت بتحس ان الناس بتستغليني فيها و ايه الموقف الي انت حسيت فيه بكده' },
  { id: 51, text: 'ايه اكتر حاجه صعبة انها تتفهم في شخصيتي وانت فهمت الحاجه ديه عني امته', isGroupPrompt: true },
  { id: 52, text: 'تغير مبادئك علشان حد بتحبه ولا تتمسك بمبادئك و تخسر الي بتحبه ولي' },
  { id: 53, text: 'تبقي الابن المفضل لاهلك و مركزين معاك ولا تبقي الابن المنسي و تعيش حياتك' },
  { id: 54, text: 'لو خيروك تعرف اليوم الي بتموت فيه او اليوم الي بيموت فيه شخص بتحبه' },
  { id: 55, text: 'شئ كنت مهوس فيه بطفولتك يعتبر غريب' },
  { id: 56, text: 'اي طريقتك في كشف شخص بيكدب عليك' },
  { id: 57, text: 'اي الي يبخلي الانسان يتغير من شخص طيب ل شخص قاسي' },
  { id: 58, text: 'هل تؤيد فكرة الفرصة التانية في العلاقات ولا شايف ان لا' },
  { id: 59, text: 'هل انت شايف ان من النوع الي ممكن يختفي فجأه من حياه حد ولا من النوع الي بيواجه و بيتكلم و يحاول يحل المشاكل' },
  { id: 60, text: 'هل بتفضل انك تخون ولا تتخان' },
  { id: 61, text: 'اي اكتر حاجه مجنونة او محرجه عملتها بسبب وجع القلب او العند او الانتقام' },
  { id: 62, text: 'لو اضطريت تتنازل عن حاجه واحده شغلك او حلمك الي بتسعي ليه ولا اقرب صداقة ليك هتختار تتنازل عن اي' },
  { id: 63, text: 'ايه الانطباع او الطاقة الي بديها للناس اللي ميعرفونيش', isGroupPrompt: true },
] as const;

export const TOTAL_QUESTIONS_COUNT = OFFICIAL_QUESTIONS.length; // 63

export function getQuestionById(id: number | null): OfficialQuestion | null {
  if (id === null) return null;
  return OFFICIAL_QUESTIONS.find((q) => q.id === id) ?? null;
}

/**
 * Randomly draws an unused question ID from the 63 official questions.
 * Returns null if all 63 questions have been exhausted.
 */
export function drawRandomUnusedQuestionId(usedQuestionIds: number[]): number | null {
  const usedSet = new Set(usedQuestionIds);
  const available = OFFICIAL_QUESTIONS.filter((q) => !usedSet.has(q.id));
  if (available.length === 0) {
    return null;
  }
  // Use crypto.getRandomValues when available for unbiased uniform draw
  let index = Math.floor(Math.random() * available.length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    index = arr[0] % available.length;
  }
  return available[index].id;
}

/**
 * Unbiased Fisher-Yates shuffle (used for randomizing player turn order).
 */
export function shuffleArray<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      j = arr[0] % (i + 1);
    }
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

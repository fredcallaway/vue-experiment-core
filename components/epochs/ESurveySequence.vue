<script lang="ts">

export type SurveyChoiceQuestion = {
  id: string
  prompt: string
  options?: string[]
  flags?: string[]
  required?: boolean
}

export type SurveyMultiPrompt = string | SurveyChoiceQuestion

export type SurveyChoicePage = {
  id: string
  kind?: 'choice'
  intro?: string
  prompt: string
  options: string[]
  flags?: string[]
  required?: boolean
}

export type SurveyTextPage = {
  id: string
  kind: 'text'
  intro?: string
  prompt: string
  placeholder?: string
  flags?: string[]
  required?: boolean
}

export type SurveyMultiPage = {
  id: string
  kind: 'multi'
  intro?: string
  sharedPrompt?: string
  options?: string[]
  prompts: SurveyMultiPrompt[]
}

export type SurveyPage = SurveyChoicePage | SurveyTextPage | SurveyMultiPage

const [logStartPage, isStartPage] = declareEventLogger<{
  surveyName: string
  pageId: string
  prompt: string
  options: string[]
}>('survey.startPage')

const [logResponse, isResponse] = declareEventLogger<{
  surveyName: string
  pageId: string
  questionId: string
  question: string
  flags: string[]
  input: 'choice' | 'text'
  response: number | string | 'SKIP'
  option?: string
  rt: number
  skipped: boolean
}>('survey.response')


export function parseSurveySequence(sessionData: SessionData) {
  return R.pipe(
    sessionData.events,
    R.filter(e => isStartPage(e) || isResponse(e)),
    chunkBy(isStartPage),
    R.flatMap((chunk) => {
      if (chunk.length === 0) return []

      const pageEvent = chunk[0]
      if (!isStartPage(pageEvent)) return []

      const responses = chunk.slice(1).filter(isResponse)
      return responses.map((r, idx) => {
        const options = pageEvent.data.options
        const responseOption = typeof r.data.response === 'number' ? options[r.data.response] : null
        const rt = r.data.rt ?? r.timestamp - (responses[idx - 1]?.timestamp ?? pageEvent.timestamp)
        const input = r.data.input ?? 'choice'
        const skipped = r.data.skipped ?? r.data.response === 'SKIP'
        const option = r.data.option ?? (!skipped && input === 'choice' ? responseOption : null)

        const parsedResponse = {
          surveyName: r.data.surveyName ?? pageEvent.data.surveyName,
          pageId: r.data.pageId ?? pageEvent.data.pageId,
          questionId: r.data.questionId ?? r.data.question,
          question: r.data.question,
          flags: r.data.flags ?? [],
          input,
          response: r.data.response,
          rt,
          maxResponse: input === 'choice' && options.length > 0 ? options.length - 1 : null,
          skipped,
        }

        return option != null
          ? { ...parsedResponse, option }
          : parsedResponse
      })
    })
  )
}

declareDataView('survey-seq', parseSurveySequence)

</script>

<script lang="ts" setup>


interface ParsedQuestion {
  question: string
  flags: string[]
}

function parseQuestion(raw: string): ParsedQuestion {
  const match = raw.match(/^\[([\w\d_\s]+)\]\s*(.*)$/)
  if (!match) return { question: raw, flags: [] }
  const flags = match[1].split(/\s+/).filter(f => f.length > 0)
  const question = match[2]
  return { question, flags }
}

const props = defineProps<{
  pages: SurveyPage[]
  name?: string
  shufflePages?: boolean
  shuffleQuestions?: boolean
  fadeMs?: NumberLike
}>()

const fadeMs = computed(() => ensureNumber(props.fadeMs ?? 500))
const fadeDuration = computed(() => `${fadeMs.value}ms`)

type SingleQuestionPage = SurveyChoicePage | SurveyTextPage
type SurveyQuestion = SingleQuestionPage | SurveyMultiPrompt

function questionIdFromPrompt(prompt: string, idx: number) {
  const id = prompt
    .toLowerCase()
    .replace(/[^\w\d]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return id || `q${idx + 1}`
}

function pageIntro(page: SurveyPage) {
  return page.intro ?? ''
}

function pageSharedPrompt(page: SurveyPage) {
  return page.kind === 'multi' ? (page.sharedPrompt ?? '') : ''
}

function pageOptions(page: SurveyPage) {
  if (page.kind === 'text') return []
  return page.options ?? []
}

function questionCount(page: SurveyPage) {
  return page.kind === 'multi' ? page.prompts.length : 1
}

function questionAt(page: SurveyPage, index: number): SurveyQuestion {
  return page.kind === 'multi' ? page.prompts[index] : page
}

function questionPrompt(question: SurveyQuestion) {
  return typeof question === 'string' ? parseQuestion(question).question : question.prompt
}

function questionId(page: SurveyPage, question: SurveyQuestion, index: number) {
  if (page.kind !== 'multi') return page.id
  return typeof question === 'string' ? questionIdFromPrompt(questionPrompt(question), index) : question.id
}

function questionFlags(question: SurveyQuestion) {
  return typeof question === 'string' ? parseQuestion(question).flags : (question.flags ?? [])
}

function questionRequired(question: SurveyQuestion) {
  return typeof question === 'string' ? false : (question.required ?? false)
}

function questionInput(page: SurveyPage): 'choice' | 'text' {
  return page.kind === 'text' ? 'text' : 'choice'
}

function questionOptions(page: SurveyPage, question: SurveyQuestion) {
  if (page.kind === 'text') return []
  if (page.kind !== 'multi') return page.options
  if (typeof question === 'string') return page.options ?? []
  return 'options' in question ? (question.options ?? page.options ?? []) : (page.options ?? [])
}

function questionPlaceholder(question: SurveyQuestion) {
  return typeof question === 'string' || !('placeholder' in question) ? '' : (question.placeholder ?? '')
}

const rng = useRandom(props.name ?? 'Survey').reset()

let pages = props.pages.map((page) => {
  if (!props.shuffleQuestions || page.kind !== 'multi') return page
  return {
    ...page,
    prompts: rng.shuffle([...page.prompts]),
  }
})

if (props.shufflePages) {
  pages = rng.shuffle([...pages])
}

const totalQuestions = pages.reduce((total, page) => total + questionCount(page), 0)

const E = useIndexableEpoch(props.name ?? 'Survey', pages.length)
const step = E.step
assert(R.isNumber(step.value), `step.value is not a number: ${step.value}`)

const showIntro = ref(true)
const currentQuestionIndex = ref(0)
const textResponse = ref('')
const questionStartedAt = ref(Date.now())
const isComplete = ref(false)
const isCompleting = ref(false)

const currentPage = computed(() => pages[step.value])

const currentQuestion = computed(() => questionAt(currentPage.value, currentQuestionIndex.value))

const currentQuestionId = computed(() => (
  questionId(currentPage.value, currentQuestion.value, currentQuestionIndex.value)
))

const currentQuestionPrompt = computed(() => questionPrompt(currentQuestion.value))

const currentQuestionFlags = computed(() => questionFlags(currentQuestion.value))

const currentQuestionInput = computed(() => questionInput(currentPage.value))

const currentQuestionOptions = computed(() => questionOptions(currentPage.value, currentQuestion.value))

const currentQuestionRequired = computed(() => questionRequired(currentQuestion.value))

const currentQuestionPlaceholder = computed(() => questionPlaceholder(currentQuestion.value))

const currentPageIntro = computed(() => pageIntro(currentPage.value))

const currentPageSharedPrompt = computed(() => pageSharedPrompt(currentPage.value))

const totalQuestionIndex = computed(() => {
  const priorQuestions = pages
    .slice(0, step.value)
    .reduce((total, page) => total + questionCount(page), 0)
  return priorQuestions + currentQuestionIndex.value + 1
})

const isLastQuestionInPage = computed(
  () => currentQuestionIndex.value === questionCount(currentPage.value) - 1
)

const isLastPage = computed(() => step.value === pages.length - 1)

watchImmediate(step, () => {
  showIntro.value = currentPageIntro.value.length > 0
  textResponse.value = ''
  if (!showIntro.value) resetQuestionTimer()
  logStartPage({
    surveyName: props.name ?? 'Survey',
    pageId: currentPage.value.id,
    prompt: currentPageSharedPrompt.value,
    options: pageOptions(currentPage.value),
  })
})

function resetQuestionTimer() {
  questionStartedAt.value = Date.now()
}

function startIntroPage() {
  showIntro.value = false
  logEvent('survey.start')
  resetQuestionTimer()
}

function responseBase() {
  return {
    surveyName: props.name ?? 'Survey',
    pageId: currentPage.value.id,
    questionId: currentQuestionId.value,
    question: currentQuestionPrompt.value,
    flags: currentQuestionFlags.value,
    input: currentQuestionInput.value,
    rt: Date.now() - questionStartedAt.value,
  }
}

function logCurrentResponse(response: number | string | 'SKIP', skipped: boolean, option?: string) {
  logResponse(option === undefined
    ? {
        ...responseBase(),
        response,
        skipped,
      }
    : {
        ...responseBase(),
        response,
        option,
        skipped,
      })
}

function selectResponse(value: string) {
  if (isCompleting.value) return
  const optionIndex = currentQuestionOptions.value.indexOf(value)
  logCurrentResponse(optionIndex, false, value)

  advanceQuestion()
}

function submitTextResponse() {
  if (isCompleting.value) return
  logCurrentResponse(textResponse.value, false)

  advanceQuestion()
}

function skipQuestion() {
  if (isCompleting.value) return
  logCurrentResponse('SKIP', true)

  advanceQuestion()
}

function advanceQuestion() {
  textResponse.value = ''
  if (isLastQuestionInPage.value) {
    if (isLastPage.value) {
      finishSurvey()
    } else {
      currentQuestionIndex.value = 0
      step.value++
    }
  } else {
    currentQuestionIndex.value++
  }
  resetQuestionTimer()
}

function finishSurvey() {
  if (isCompleting.value) return
  isCompleting.value = true
  isComplete.value = true
  window.setTimeout(() => E.done(), fadeMs.value)
}
</script>

<template>
  <div max-w-800px mx-auto flex flex-col>
    <Transition name="page" mode="out-in">
      <div v-if="!isComplete" :key="step" flex flex-col gap-8 flex-1>

        <template v-if="showIntro">
          <div w-140 mx-auto flex-center gap-4>
            <p text-xl text-center leading-relaxed m-0 v-html="currentPageIntro" />
            <PButton value="Start" @click="startIntroPage" />
          </div>
        </template>
        <template v-else>
          <div v-if="currentPageSharedPrompt" text-center italic v-html="currentPageSharedPrompt" />
          <div flex-1 flex items-center justify-center min-h-150px>
            <p text-xl text-center leading-relaxed m-0>{{ currentQuestionPrompt }}</p>
          </div>

          <PButtons
            v-if="currentQuestionInput === 'choice'"
            :values="currentQuestionOptions"
            @click="selectResponse"
          />

          <div v-else flex flex-col gap-4 items-center>
            <textarea
              v-model="textResponse"
              input
              rows="4"
              w-full
              max-w-620px
              :placeholder="currentQuestionPlaceholder"
            />
            <PButton
              value="Submit"
              :disabled="currentQuestionRequired && textResponse.trim().length === 0"
              @click="submitTextResponse"
            />
          </div>

          <div v-if="!currentQuestionRequired" flex justify-center mt-4>
            <PButton value="Skip" btn-gray @click="skipQuestion" />
          </div>

          <div text-center text-gray-600 text-sm pt-4>
            <span>
              Question {{ totalQuestionIndex }} of {{ totalQuestions }}
            </span>
          </div>
        </template>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page-enter-active,
.page-leave-active {
  transition: opacity v-bind(fadeDuration), transform v-bind(fadeDuration);
}

.page-enter-from {
  opacity: 0;
/* transform: translateX(40px); */
}

.page-leave-to {
  opacity: 0;
/* transform: translateX(-40px); */
}
</style>

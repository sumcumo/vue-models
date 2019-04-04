import {
  ModelInstallOptions,
  VueModel,
  VueModelOptions,
  VueModelOptionsFinal,
  VueModelProvided,
} from './types'
import Registry from './registry'
import {
  ComponentOptions,
  VueConstructor,
} from 'vue'
import { Vue } from 'vue/types/vue'

export { Registry }

function resolveInjection(this: VueModelProvided, key: string) {
  // tslint:disable-next-line no-this-assignment
  let source = this
  let ressource: VueModelProvided | null = null

  while (source = (source.$parent as VueModelProvided)) {
    if (source.$modelsProvidedKeys && source.$modelsProvidedKeys.includes(key)) {
      ressource = source
      break
    }
  }

  if (ressource === null) {
    throw new Error(`No provider found for ${key}`)
  }

  Object.defineProperty(
    this,
    key,
    {
      get: () => (ressource as any)[key],
    },
  )
}

function createModel(
  vmHost: VueModelProvided,
  name: string,
  options: VueModelOptions,
  mergeMixins: Required<ComponentOptions<Vue>>['mixins'],
): VueModelOptionsFinal {
  const modelId = options.modelId || 'single'
  const modelGId = `${name}~${modelId}`
  const data = vmHost.$modelRegistry.getImportedStateFor(modelGId) || options.data || (() => ({}))
  const mixins = [...mergeMixins, ...(options.mixins || [])]

  return Object.assign({}, options, {
    mixins,
    name,
    modelId,
    modelGId,
    data,
    parent: vmHost,
  })
}

const OPTIONS_DEFAULTS: ModelInstallOptions = {
  mixins: [],
  restoreOnReplace: false,
  globalModels: {},
}

export default {
  install(
    vue: VueConstructor,
    rawInstallOptions: Partial<ModelInstallOptions> = {},
  ) {
    const installOptions: ModelInstallOptions = Object.assign({}, OPTIONS_DEFAULTS, rawInstallOptions)

    vue.mixin({
      beforeCreate(this: VueModelProvided) {
        const { modelRegistry, injectModels } = this.$options
        this.$modelRegistry = this === this.$root
          ? (modelRegistry || new Registry(installOptions.restoreOnReplace))
          : (<VueModelProvided>this.$root).$modelRegistry

        if (injectModels) {
          injectModels.forEach((inject) => {
            resolveInjection.call(this, inject)
          })
        }
      },
      created(this: VueModelProvided) {
        this.$modelsProvided = {}

        if (!this.$options.models && this !== this.$root) {
          return
        }

        let { models = {} } = this.$options

        if (typeof models === 'function') {
          models = models.call(this)
        }

        if (this === this.$root) {
          const globalModels = installOptions.globalModels
          Object.values(globalModels).forEach(m => m.modelId = 'global')
          models = Object.assign({}, globalModels, models)
        }

        this.$modelsProvidedKeys = Object.keys(models)

        Object
          .entries(models)
          .map(([key, options]) => {
            const vm = new vue(createModel(this, key, options, installOptions.mixins)) as VueModel

            (this as any)[key] = this.$modelsProvided[key] = vm
            this.$modelRegistry.register(vm)

            this.$on('hook:beforeDestroy', () => {
              this.$modelRegistry.unregister(vm)
              vm.$destroy()
            })
          })
      },
    })
  },
}

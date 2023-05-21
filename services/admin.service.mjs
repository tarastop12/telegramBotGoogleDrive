import retry from 'async-retry';
import {
  InlineKeyboard,
  Keyboard,
} from 'grammy';

import {
  options,
  REMINDER_MSG_TEXT,
} from '../variables.mjs';

function adminPanel() {
  return async (ctx) => {
    try {
      await ctx.reply('Управляйте пользователями', {
        reply_markup: new Keyboard()
          .text('Показать всех пользователей')
          .text('Найти пользователя')
          .row()
          .text('Настроить время оповещения')
          .text('Настроить вопросы')
          .row()
          .text('Сделать рассылку')
          .resized(),
      })
    } catch (err) {
      console.error('adming.service > adminPanel' + err)
    }
  }
}

function newsletterPanel() {
  return async (ctx) => {
    const text = 'Отправьте текcт'
    ctx.session.scene = 'enter_letter_text'

    try {
      ctx.reply(text)
    } catch (err) {
      console.error('adming.service > newsletterPanel' + err)
    }
  }
}

function sendNewsletterForAll(UsersRepository, botInstance) {
  return async (ctx) => {
    ctx.session.scene = ''
    const messageText = ctx.msg.text
    try {
      const users = await UsersRepository.getAllAzs();

      const promises = users.map(async (user) => {
        const id = user.Id
        try {
          await botInstance.api.sendMessage(id, messageText)
          await new Promise(resolve => setTimeout(resolve, 500))
        } catch (err) {
          console.error('Error sending message to user:', id)
          await retry(async () => await botInstance.api.sendMessage(id, messageText), options)
        }
      })

      await Promise.all(promises)
    } catch(err) {
      console.error('adming.service > sendNewsletterForAll' + err)
    }
  }
}

function userSearch() {
  return async (ctx) => {
    try {
      ctx.reply(`Введите ID пользователя`, {})
      ctx.session.scene = 'enter_id'
    } catch (err) {
      console.error('admin.service > userSearch' + err)
    }
  }
}

function getAllUsers(usersRepository) {
  return async (ctx) => {
    try {
      const users = await usersRepository.getAllUsers()
      const sortUsers = users.sort((a, b) => a.Name.split(' ')[1] - b.Name.split(' ')[1])
      const markup = new InlineKeyboard()
      sortUsers.forEach((item) => {
        markup.text(item.Name, `userId_${item.Id}`).row()
      })
      await ctx.reply('Все пользователи', {
        reply_markup: markup,
      })
    } catch (err) {
      console.error('admin.service > getAllUsers' + err)
    }
  }
}

function userProfile(usersRepository) {
  return async (ctx) => {
    const calbackId = ctx.update.callback_query?.data.split('_')[1]
    const id = calbackId ? calbackId : ctx.msg.text
    ctx.session.scene = ''

    try {
      const user = await usersRepository.getUser(id)

      const markup = new InlineKeyboard()
        .text(
          user.Group == 'admin'
            ? 'Разжаловать'
            : 'Повысить до администратора',
          `promote_${user.Id}`
        )
        .row()
        .text(
          user.Group !== 'waitConfirm'
            ? 'Ограничить доступ'
            : 'Выдать доступ',
          `wait_${user.Id}`
        )

      if (user.Group === 'azs' || user.Group === 'azsWithStore') {
        markup
          .row()
          .text(
            user.Group == 'azs'
              ? 'Изменить роль на АЗС с магазином'
              : 'Изменить роль на АЗС без магазина(киоск)',
            `updateGroup_${user.Id}`
          )
          .row()
          .text('Отправить напоминание', `sendReminder_${user.Id}`)
      }


      return await ctx.reply(
        `Информация о пользователе: \n` +
        `Дата регистрации: ${new Date(user.createdDate).toLocaleDateString()}\n` +
        `ID: ${user.Id}\n` +
        `Никнейм: ${user.Name}\n` +
        `Роль: ${user.Group}\n` +
        `Личная папка: ${user.UserFolder}`,
        {
          reply_markup: markup,
        }
      )
    } catch (err) {
      const errArr = err.message.split(':')
      if (errArr[0] === `Ошибка в получении пользователя`) {
        return await ctx.reply('Данный пользователь не найден!')
      }
      console.error('admin.service > userProfile' + err)
    }
  }
}

function userPromote(usersRepository) {
  return async (ctx) => {
    try {
      const id = ctx.update.callback_query?.data.split('_')[1]
      const user = await usersRepository.getUser(id)

      if (!ctx.session.isAdmin && !ctx.session.isTopAdmin)
        return await ctx.editMessageText('Вы не администратор!')

      if (user.Group == 'admin') {
        await usersRepository.updateUser(id, user.Name, 'waitConfirm')
        return await ctx.editMessageText('Пользователь успешно понижен!')
      } else if (user.Group != 'admin') {
        await usersRepository.updateUser(id, user.Name, 'admin')
        return await ctx.editMessageText('Пользователь успешно повышен!')
      }
    } catch (err) {
      console.error('admin.service > userPromote' + err)
    }
  }
}

function userGroup(usersRepository) {
  return async (ctx) => {
    try {
      const id = ctx.update.callback_query?.data.split('_')[1]
      const user = await usersRepository.getUser(id)

      if (!ctx.session.isAdmin && !ctx.session.isTopAdmin)
        return await ctx.editMessageText('Вы не администратор!')

      if (id == ctx.session.user.id)
        return await ctx.editMessageText(
          'Вы не можете ограничить доступ самому себе!'
        )
      if (user.Group == 'admin' && !ctx.session.isTopAdmin)
        return await ctx.editMessageText(
          'Вы не можете  ограничить доступ администратору!'
        )

      if (user.Group == 'waitConfirm') {
        await ctx.editMessageText('Выберите тип АЗС', {
          reply_markup: new InlineKeyboard()
            .text('Азс без магазина', `access_azs_${id}`)
            .row()
            .text('Азс с магазином', `access_azsWithStore_${id}`),
        })
      } else if (
        user.Group == 'azs' ||
        user.Group == 'azsWithoutStore' ||
        user.Group == 'admin'
      ) {
        await usersRepository.updateUser(id, user.Name, 'waitConfirm')
        await ctx.editMessageText('Пользователю успешно ограничен доступ!')
      }
    } catch (err) {
      console.error('admin.service > userGroup' + err)
    }
  }
}

function updateGroup(usersRepository) {
  return async (ctx) => {
    const id = ctx.update.callback_query?.data.split('_')[2]
    const azsType = ctx.update.callback_query?.data.split('_')[1]
    const user = await usersRepository.getUser(id)

    await usersRepository.updateUser(id, user.Name, azsType)

    ctx.editMessageText(
      `Изменить имя пользователя ?\nТекущее имя: ${user.Name}\n\nШаблон: [azs][num]`,
      {
        reply_markup: new InlineKeyboard()
          .text('Изменить', `editName_${id}`)
          .row()
          .text('Оставить как есть и выдать доступ', `createFolder_${id}`),
      }
    )
  }
}

function requestNewUserName() {
  return async (ctx) => {
    const id = ctx.update.callback_query?.data.split('_')[1]

    try {
      ctx.editMessageText(`Введите новое имя пользователя`, {})
      ctx.session.scene = 'enter_name'
      ctx.session.customData.id = id
    } catch (err) {
      console.error('admin.service > requestNewUserName ' + err)
    }
  }
}

function editUserName(usersRepository) {
  return async (ctx) => {
    const id = ctx.session.customData.id
    const newName = ctx.msg.text
    try {
      const user = await usersRepository.getUser(id)
      await usersRepository.updateUser(id, newName, user.Group)
      ctx.reply('Имя успешно обновлено', {
        reply_markup: new InlineKeyboard().text(
          'Выдать доступ',
          `createFolder_${id}`
        ),
      })
      ctx.session.scene = ''
      delete ctx.session.customData.id
    } catch (err) {
      console.error('admin.service > editUserName ' + err)
    }
  }
}

function createUserFolder(
  botInstance,
  Googlerepository,
  UsersRepository
) {
  return async (ctx) => {
    try {
      const id = ctx.update.callback_query?.data.split('_')[1]
      const user = await UsersRepository.getUser(id)
      const res = await Googlerepository.makeFolder({
        folderName: user.Name,
        parentIdentifiers: { fileName: process.env.MAIN_FOLDER_NAME }
      })
      await UsersRepository.updateUser(id, user.Name, user.Group, res)
      console.log('Success created userFolder:', res)
      ctx.editMessageText(`Успешно создана папка: ${user.Name}\nid: ${res}`)
      botInstance.api.sendMessage(
        id,
        `Вам успешно выдали доступ\nВаше имя: ${user.Name}`
      )
    } catch (err) {
      console.error('admin.service > createFolder: ', err);
    }

  }
}

function sendReminderMessageForUser(botInstance) {
  return async (ctx) => {
    const id = ctx.update.callback_query?.data.split('_')[1]
    const markup = {
      reply_markup: new InlineKeyboard()
        .text('Да', 'startCheck')
        .row()
        .text('Нет', 'postponeСheck'),
    }

    try {
      await retry(async () => await botInstance.api.sendMessage(id, REMINDER_MSG_TEXT, markup), options)
      ctx.editMessageText('Уведомление отправленно!')
    } catch (err) {
      console.error('Error sending reminder to user:', err)
    }
  }
}

export {
  adminPanel,
  createUserFolder,
  editUserName,
  getAllUsers,
  newsletterPanel,
  requestNewUserName,
  sendNewsletterForAll,
  sendReminderMessageForUser,
  updateGroup,
  userGroup,
  userProfile,
  userPromote,
  userSearch,
};
